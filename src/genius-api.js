const axios = require("axios");

const request = axios.create({ baseURL: `http://${process.env.GENIUSHUB_IP}:1223/v3/` });
const headers = { Authorization: `Basic ${process.env.GENIUSHUB_TOKEN}` };

const fetchZones = function() {
  return request.get('zones', { headers });
}

const setZoneToOverride = function(zoneId, duration) {
  const data = { iMode: 16 };

  if (duration) {
    data.iBoostTimeRemaining = duration;
  }

  return request.patch(`zone/${zoneId}`, data, { headers });
}

const setSwitchState = function(zoneId, state) {
  const data = { fBoostSP: state ? 1 : 0 };

  return request.patch(`zone/${zoneId}`, data, { headers });
}

const setZoneMode = function(zoneId, mode) {
  const data = { iMode: mode };

  return request.patch(`zone/${zoneId}`, data, { headers });
}

const setRoomSetpoint = function(zoneId, setpoint) {
  const data = { fBoostSP: setpoint };

  return request.patch(`zone/${zoneId}`, data, { headers });
}

module.exports.fetchZones = fetchZones;
module.exports.setZoneToOverride = setZoneToOverride;
module.exports.setSwitchState = setSwitchState;
module.exports.setZoneMode = setZoneMode;
module.exports.setRoomSetpoint = setRoomSetpoint;
