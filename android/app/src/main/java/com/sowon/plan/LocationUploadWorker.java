package com.sowon.plan;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationManager;
import android.os.Build;
import android.os.CancellationSignal;

import androidx.annotation.NonNull;
import androidx.core.content.ContextCompat;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.OutputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

public class LocationUploadWorker extends Worker {
    private static final String STATE_URL = "https://sowons-plan.vercel.app/api/state";
    private static final int LOCATION_TIMEOUT_SECONDS = 25;

    public LocationUploadWorker(
            @NonNull Context context,
            @NonNull WorkerParameters workerParams
    ) {
        super(context, workerParams);
    }

    @NonNull
    @Override
    public Result doWork() {
        try {
            if (!hasLocationPermission()) {
                return Result.success();
            }

            Location location = getBestLocation();
            if (location == null) {
                return Result.retry();
            }

            JSONObject state = getState();
            JSONObject nextState = appendSowonLocation(state, location);
            putState(nextState);
            return Result.success();
        } catch (Exception error) {
            return Result.retry();
        }
    }

    private boolean hasLocationPermission() {
        Context context = getApplicationContext();
        boolean hasFine = ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED;
        boolean hasCoarse = ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.ACCESS_COARSE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED;
        boolean hasBackground = Build.VERSION.SDK_INT < Build.VERSION_CODES.Q ||
                ContextCompat.checkSelfPermission(
                        context,
                        Manifest.permission.ACCESS_BACKGROUND_LOCATION
                ) == PackageManager.PERMISSION_GRANTED;

        return (hasFine || hasCoarse) && hasBackground;
    }

    private Location getBestLocation() throws InterruptedException {
        Location current = null;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            current = getCurrentLocation(LocationManager.GPS_PROVIDER);
            if (current == null) {
                current = getCurrentLocation(LocationManager.NETWORK_PROVIDER);
            }
        }

        Location lastKnown = getNewestLastKnownLocation();
        if (current == null) return lastKnown;
        if (lastKnown == null) return current;
        return current.getTime() >= lastKnown.getTime() ? current : lastKnown;
    }

    private Location getCurrentLocation(String provider) throws InterruptedException {
        LocationManager manager = (LocationManager) getApplicationContext()
                .getSystemService(Context.LOCATION_SERVICE);
        if (manager == null || !manager.isProviderEnabled(provider)) {
            return null;
        }

        CountDownLatch latch = new CountDownLatch(1);
        AtomicReference<Location> result = new AtomicReference<>();
        CancellationSignal signal = new CancellationSignal();
        ExecutorService executor = Executors.newSingleThreadExecutor();

        try {
            manager.getCurrentLocation(
                    provider,
                    signal,
                    executor,
                    location -> {
                        result.set(location);
                        latch.countDown();
                    }
            );
            latch.await(LOCATION_TIMEOUT_SECONDS, TimeUnit.SECONDS);
            signal.cancel();
            return result.get();
        } catch (SecurityException error) {
            return null;
        } finally {
            executor.shutdownNow();
        }
    }

    private Location getNewestLastKnownLocation() {
        LocationManager manager = (LocationManager) getApplicationContext()
                .getSystemService(Context.LOCATION_SERVICE);
        if (manager == null) return null;

        Location newest = null;
        String[] providers = {
                LocationManager.GPS_PROVIDER,
                LocationManager.NETWORK_PROVIDER,
                LocationManager.PASSIVE_PROVIDER
        };

        for (String provider : providers) {
            try {
                Location location = manager.getLastKnownLocation(provider);
                if (location != null && (newest == null || location.getTime() > newest.getTime())) {
                    newest = location;
                }
            } catch (SecurityException ignored) {
                return null;
            } catch (IllegalArgumentException ignored) {
            }
        }

        return newest;
    }

    private JSONObject getState() throws Exception {
        HttpURLConnection connection = openConnection("GET");
        int status = connection.getResponseCode();
        if (status < 200 || status >= 300) {
            throw new IllegalStateException("State GET failed: " + status);
        }
        String body = readResponse(connection);
        return new JSONObject(body);
    }

    private void putState(JSONObject state) throws Exception {
        byte[] body = state.toString().getBytes(StandardCharsets.UTF_8);
        HttpURLConnection connection = openConnection("PUT");
        connection.setDoOutput(true);
        connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
        connection.setFixedLengthStreamingMode(body.length);

        try (OutputStream stream = connection.getOutputStream()) {
            stream.write(body);
        }

        int status = connection.getResponseCode();
        if (status < 200 || status >= 300) {
            throw new IllegalStateException("State PUT failed: " + status);
        }
    }

    private HttpURLConnection openConnection(String method) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(STATE_URL).openConnection();
        connection.setRequestMethod(method);
        connection.setConnectTimeout(15000);
        connection.setReadTimeout(15000);
        connection.setRequestProperty("Accept", "application/json");
        return connection;
    }

    private String readResponse(HttpURLConnection connection) throws Exception {
        StringBuilder builder = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(connection.getInputStream(), StandardCharsets.UTF_8)
        )) {
            String line;
            while ((line = reader.readLine()) != null) {
                builder.append(line);
            }
        }
        return builder.toString();
    }

    private JSONObject appendSowonLocation(JSONObject state, Location location) throws Exception {
        JSONObject nextState = new JSONObject(state.toString());
        JSONObject locations = nextState.optJSONObject("locations");
        if (locations == null) {
            locations = new JSONObject();
            nextState.put("locations", locations);
        }

        JSONObject sowon = locations.optJSONObject("sowon");
        if (sowon == null) {
            sowon = new JSONObject();
            locations.put("sowon", sowon);
        }

        JSONArray history = sowon.optJSONArray("history");
        if (history == null) {
            history = new JSONArray();
            JSONObject legacyLatest = sowon.optJSONObject("latest");
            if (legacyLatest != null) {
                history.put(legacyLatest);
            }
        }

        String updatedAt = isoNow();
        JSONObject entry = new JSONObject();
        entry.put("id", "location-" + updatedAt + "-" + UUID.randomUUID());
        entry.put("latitude", location.getLatitude());
        entry.put("longitude", location.getLongitude());
        entry.put("accuracy", location.hasAccuracy() ? location.getAccuracy() : JSONObject.NULL);
        entry.put("updatedAt", updatedAt);
        entry.put("address", "");
        entry.put("source", "android-workmanager");

        history.put(entry);
        sowon.put("latest", entry);
        sowon.put("history", history);
        locations.put("sowon", sowon);
        nextState.put("locations", locations);

        return nextState;
    }

    private String isoNow() {
        SimpleDateFormat format = new SimpleDateFormat(
                "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
                Locale.US
        );
        format.setTimeZone(TimeZone.getTimeZone("UTC"));
        return format.format(new Date());
    }
}
