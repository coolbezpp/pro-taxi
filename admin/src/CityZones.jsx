export default function CityZones() {
  return (
    <iframe
      title="Карта городских зон"
      src={import.meta.env.BASE_URL + "city-zones-map.html"}
      allow="geolocation"
      style={{
        width: "100%",
        height: "1100px",
        border: 0,
        borderRadius: 14,
        background: "#f4f6f8"
      }}
    />
  );
}
