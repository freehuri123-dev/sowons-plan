function getNaverClientId() {
  return process.env.NAVER_MAP_CLIENT_ID || process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID;
}

function getNaverClientSecret() {
  return process.env.NAVER_MAP_CLIENT_SECRET;
}

function joinAddressParts(parts) {
  return parts.filter(Boolean).join(" ");
}

function formatReverseGeocodeResult(result) {
  if (!result) return "";

  const region = result.region || {};
  const land = result.land || {};
  const areaParts = [
    region.area1?.name,
    region.area2?.name,
    region.area3?.name,
    region.area4?.name,
  ];

  if (result.name === "roadaddr" && land.name) {
    const roadNumber = land.number2
      ? `${land.number1}-${land.number2}`
      : land.number1;
    return joinAddressParts([...areaParts, land.name, roadNumber]);
  }

  const jibunNumber = land.number2
    ? `${land.number1}-${land.number2}`
    : land.number1;
  return joinAddressParts([...areaParts, jibunNumber]);
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const latitude = Number(searchParams.get("lat"));
  const longitude = Number(searchParams.get("lng"));
  const clientId = getNaverClientId();
  const clientSecret = getNaverClientSecret();

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return Response.json({ error: "Invalid coordinates" }, { status: 400 });
  }

  if (!clientId || !clientSecret) {
    return Response.json(
      { error: "Naver reverse geocoding is not configured." },
      { status: 503 }
    );
  }

  const params = new URLSearchParams({
    coords: `${longitude},${latitude}`,
    orders: "roadaddr,addr",
    output: "json",
  });

  const response = await fetch(
    `https://maps.apigw.ntruss.com/map-reversegeocode/v2/gc?${params}`,
    {
      headers: {
        "X-NCP-APIGW-API-KEY-ID": clientId,
        "X-NCP-APIGW-API-KEY": clientSecret,
      },
    }
  );

  if (!response.ok) {
    return Response.json(
      { error: "Naver reverse geocoding request failed." },
      { status: response.status }
    );
  }

  const data = await response.json();
  const address =
    (Array.isArray(data.results) ? data.results : [])
      .map(formatReverseGeocodeResult)
      .find(Boolean) || "";

  return Response.json(
    { address },
    { headers: { "Cache-Control": "public, max-age=86400" } }
  );
}
