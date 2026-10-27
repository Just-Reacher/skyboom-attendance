const R = 6371000; // metres
const rad = (d) => (d * Math.PI) / 180;
function distanceMetres(lat1, lon1, lat2, lon2) {
  const dLat = rad(lat2 - lat1), dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
// Returns {ok, code, message, distance}. Always evaluated on the server.
function verifyLocation(office, { latitude, longitude, accuracy }) {
  if (!office) return { ok: false, code: 'NO_OFFICE', message: 'The office location has not been configured. Contact an administrator.' };
  if (accuracy > office.max_accuracy_m)
    return { ok: false, code: 'LOW_ACCURACY', message: `Your device location is not accurate enough (${Math.round(accuracy)} m; maximum allowed is ${office.max_accuracy_m} m). Move near a window or outdoors, turn on GPS, and try again.` };
  const distance = distanceMetres(latitude, longitude, office.latitude, office.longitude);
  if (distance > office.radius_m)
    return { ok: false, code: 'OUTSIDE_GEOFENCE', message: `You are about ${Math.round(distance)} m from the office. You must be within ${office.radius_m} m to record attendance.`, distance };
  return { ok: true, code: 'VERIFIED', distance };
}
module.exports = { distanceMetres, verifyLocation };
