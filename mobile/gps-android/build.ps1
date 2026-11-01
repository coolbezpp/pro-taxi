# Сборка APK «Про GPS» без Gradle: aapt2 + javac + d8 + apksigner
# из установленного Android SDK (Android Studio). Результат: pro-gps.apk
# рядом со скриптом.
#
# Проект копируется во временный ASCII-каталог: пути репозитория содержат
# кириллицу и пробелы, а утилиты SDK (d8/apksigner — bat-обёртки) на этом
# ломаются.
$ErrorActionPreference = "Stop"

$src     = $PSScriptRoot
$sdk     = "$env:LOCALAPPDATA\Android\Sdk"
$bt      = "$sdk\build-tools\36.0.0"
$android = "$sdk\platforms\android-37.0\android.jar"
$jbr     = "C:\Program Files\Android\Android Studio\jbr"
$work    = "$env:TEMP\gps-android-build"

foreach ($p in @($bt, $android, "$jbr\bin\java.exe")) {
    if (-not (Test-Path $p)) { throw "Не найдено: $p" }
}
$env:JAVA_HOME = $jbr
$env:PATH = "$jbr\bin;$env:PATH"

# Чистый рабочий каталог (ASCII)
if (Test-Path $work) { Remove-Item $work -Recurse -Force }
New-Item -ItemType Directory -Force -Path "$work\classes", "$work\dex" | Out-Null
Copy-Item "$src\AndroidManifest.xml" $work
Copy-Item "$src\src" $work -Recurse
Copy-Item "$src\res" $work -Recurse

# Иконка — та же, что у миниаппа (192×192)
$icon = "$src\..\..\miniapps\executor\public\icon-192.png"
New-Item -ItemType Directory -Force -Path "$work\res\mipmap-xxxhdpi" | Out-Null
Copy-Item $icon "$work\res\mipmap-xxxhdpi\ic_launcher.png" -Force

function Invoke-Step($name, [scriptblock]$fn) {
    Write-Host "==> $name"
    & $fn
    if ($LASTEXITCODE -ne 0) { throw "Шаг '$name' завершился с ошибкой ($LASTEXITCODE)" }
}

# 1. Компиляция ресурсов
Invoke-Step "aapt2 compile" {
    & "$bt\aapt2.exe" compile --dir "$work\res" -o "$work\res.zip"
}

# 2. Связывание ресурсов + манифест → базовый APK
Invoke-Step "aapt2 link" {
    & "$bt\aapt2.exe" link -o "$work\base.apk" --manifest "$work\AndroidManifest.xml" `
        -I $android "$work\res.zip" `
        --min-sdk-version 26 --target-sdk-version 34 `
        --version-code 1 --version-name "1.0" `
        --auto-add-overlay
}

# 3. Компиляция Java (class files v61 — их понимает d8)
Invoke-Step "javac" {
    $sources = Get-ChildItem "$work\src" -Recurse -Filter *.java | ForEach-Object { $_.FullName }
    & "$jbr\bin\javac.exe" --release 17 -encoding UTF-8 -nowarn -cp $android -d "$work\classes" $sources
}

# 4. Дексикация
Invoke-Step "d8" {
    $classes = Get-ChildItem "$work\classes" -Recurse -Filter *.class | ForEach-Object { $_.FullName }
    & "$bt\d8.bat" --release --min-api 26 --lib $android --output "$work\dex" $classes
}
if (-not (Test-Path "$work\dex\classes.dex")) { throw "classes.dex не создан" }

# 5. classes.dex внутрь APK
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::Open("$work\base.apk",
    [System.IO.Compression.ZipArchiveMode]::Update)
$entry = $zip.CreateEntry("classes.dex")
$fs = [System.IO.File]::OpenRead("$work\dex\classes.dex")
$es = $entry.Open()
$fs.CopyTo($es)
$es.Dispose(); $fs.Dispose(); $zip.Dispose()

# 6. Выравнивание (нужно до подписи v2/v3)
Invoke-Step "zipalign" {
    & "$bt\zipalign.exe" -f 4 "$work\base.apk" "$work\aligned.apk"
}

# 7. Подпись — ключ создаётся один раз и переиспользуется: обновления APK
#    должны быть подписаны тем же ключом, иначе Android не установит их
$ks = "$src\keystore\pro-gps.keystore"
if (-not (Test-Path $ks)) {
    Write-Host "==> keytool: генерация ключа подписи"
    New-Item -ItemType Directory -Force -Path (Split-Path $ks) | Out-Null
    & "$jbr\bin\keytool.exe" -genkeypair -keystore $ks -alias pro `
        -keyalg RSA -keysize 2048 -validity 10950 `
        -storepass procity-gps -keypass procity-gps `
        -dname "CN=Pro GPS, O=Pro, L=Krasnodar, C=RU"
    if ($LASTEXITCODE -ne 0) { throw "keytool failed" }
}

Invoke-Step "apksigner sign" {
    & "$bt\apksigner.bat" sign --ks $ks `
        --ks-pass pass:procity-gps --key-pass pass:procity-gps `
        --out "$src\pro-gps.apk" "$work\aligned.apk"
}

Invoke-Step "apksigner verify" {
    & "$bt\apksigner.bat" verify "$src\pro-gps.apk"
}

$size = [Math]::Round((Get-Item "$src\pro-gps.apk").Length / 1KB)
Write-Host "Готово: $src\pro-gps.apk ($size КБ)"
