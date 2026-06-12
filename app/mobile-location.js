"use client";

import { Geolocation } from "@capacitor/geolocation";

export async function getCurrentMobilePosition() {
  if (typeof window === "undefined") {
    return null;
  }

  if (!window.Capacitor?.isNativePlatform?.()) {
    if (!navigator.geolocation) return null;

    const position = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 15000,
      });
    });

    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      timestamp: position.timestamp,
    };
  }

  const permission = await Geolocation.requestPermissions();
  if (
    permission.location !== "granted" &&
    permission.coarseLocation !== "granted"
  ) {
    throw new Error("Location permission was not granted.");
  }

  const position = await Geolocation.getCurrentPosition({
    enableHighAccuracy: true,
    timeout: 15000,
  });

  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: position.coords.accuracy,
    timestamp: position.timestamp,
  };
}
