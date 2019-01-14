/****
Thermostat MQTT topics to take into account:
smartthings/Virtual thermostat/temperature
smartthings/Virtual thermostat/heatingSetpoint
smartthings/Virtual thermostat/thermostatSetpoint
smartthings/Virtual thermostat/thermostatMode

We can't actually do this, given that we want to be able to specify override times, and that's not possible in the default thermostat.
It's going to need some custom functionality.
It's probably possible to implement just the default period of override, same as pressing the button on a radiator valve.
****/


const async = require("async");
const api = require('./src/genius-api.js');
const mqtt = require('./src/mqtt.js');

// Cache of current states.
const zoneCache = {
  switches: {},
  rooms: {},
  houses: {},
};

const parseMode = m => {
  switch (m) {
    case 1: // off
      return 'off';
    case 2: // timer
    case 4: // footprint
    case 8: // away
    case 32: // early
    case 128: // linked
      return 'auto';
    case 16: // boost
      return 'heat';
    case 64: // test
    case 256: // other
    default:
      return 'unknown';
  }
}

// Parse the response to extract the relevant information.
const parseZoneData = raw => {
  const zones = {
    switches: {},
    rooms: {},
    houses: {},
  };
  for (var i = 0; i < raw.length; i++) {
    const zone = raw[i];
    switch (zone.iType) {
      case 1: // House
        break;
      case 2: // Switch
        if (!zone.nodes.length) {
          // This is hot water, which we don't want to deal with.
          continue;
        }

        // Populate the switch object with the information we need.
        const $switch = {
          id: zone.iID,
          name: zone.strName,
          state: zone.fSP == 1,
        };
        zones.switches[$switch.id] = $switch;
        break;
      case 3: // Room
        // Populate the room object with the information we need.
        const room = {
          id: zone.iID,
          name: zone.strName,
          mode: parseMode(zone.iMode),
          defaultMode: zone.iBaseMode,
          defaultOverrideDuration: zone.iOverrideDuration,
          // overrideSetpoint: zone.fBoostSP,
          temperature: zone.fPV,
          setpoint: zone.fSP,
          battery: Math.min(...zone.datapoints.filter(i => i.addr == 'Battery').map(i => i.val)),
          luminance: Math.max(...zone.datapoints.filter(i => i.addr == 'LUMINANCE').map(i => i.val)),
        };

        zones.rooms[room.id] = room;
        break;
    }
  }

  return zones;
}

const checkForChange = (cached, current, property, publish) => {
  if (cached[property] == current[property]) {
    return;
  }

  console.log(`${current.name} (${current.id}) ${property} changed from ${cached[property]} to ${current[property]}`);
  cached[property] = current[property];
  console.log(current);

  if (publish) {
    console.log('publishing')
    publish(current);
  }
}

// Register MQTT processing callbacks
const subscribe = () => {
  
  mqtt.subscribeAttribute('switch', (name, message) => {
    const cached = Object.values(zoneCache.switches).find(i => i.name == name);
    const state = message == 'on';
    console.log(`Received mqtt request to set ${name} (${cached.id}) state to ${state}.`)
    if (cached.state != state) {
      console.log(`Sending api request to set ${name} (${cached.id}) state to ${state}.`)
      api.setSwitchState(cached.id, state);
    }
  });
  
  mqtt.subscribeAttribute('heatingSetpoint', (name, message) => {
    const cached = Object.values(zoneCache.rooms).find(i => i.name == name);
    const setpoint = parseFloat(message);
    console.log(`Received mqtt request to set ${name} (${cached.id}) setpoint to ${setpoint}.`)
    if (cached.setpoint != setpoint) {
      console.log(`Sending api request to set ${name} (${cached.id}) setpoint to ${setpoint}.`)
      api.setRoomSetpoint(cached.id, setpoint);
    }
  });
  
  mqtt.subscribeAttribute('thermostatMode', (name, message) => {
    const cached = Object.values(zoneCache.rooms).find(i => i.name == name);
    const mode = message;
    console.log(`Received mqtt request to set ${name} (${cached.id}) mode to ${mode}.`)
    if (cached.mode != mode) {  
      if (mode == 'heat') {
        console.log(`Sending api request to set ${name} (${cached.id}) to override for ${cached.defaultOverrideDuration} sec.`)
        api.setZoneToOverride(cached.id, cached.defaultOverrideDuration);
      } else {
        const modeId = mode == 'off' ? 1 : cached.defaultMode;
        console.log(`Sending api request to set ${name} (${cached.id}) mode to ${modeId} (${mode}).`)
        api.setZoneMode(cached.id, modeId);  
      }
    }
  });

  for (const id in zoneCache.switches) {
    mqtt.subscribeDevice(zoneCache.switches[id].name);
  }

  for (const id in zoneCache.rooms) {
    mqtt.subscribeDevice(zoneCache.rooms[id].name);
  }
}

const run = () => {  
  // Update switches to override every 3 hours
  const updateModeInterval = 3*60*60e3;
  async.forever(
    function(next) {
      console.log('Setting switches to override');

      // Set each switch to override mode.
      for (const id in zoneCache.switches) {
        api.setZoneToOverride(id, 23*60*60)
          .catch(error => {
            console.log(error);
          });
      }

      // Repeat after the interval.
      setTimeout(function() {
        next();
      }, updateModeInterval)
    },
    function(err) {
      // TODO: getting the occasional code:ETIMEDOUT error, which we should probably ignore
      // rather than polluting the log.
      console.error(err);
    }
  );

  // Update all zones every 5 seconds
  const pollInterval = 5e3;
  async.forever(
    function(next) {
      api.fetchZones()
        .then(response => {
          console.log(`Data for ${response.data.data.length} zones fetched`);

          // Parse response to extract the relevant information.
          var zones = parseZoneData(response.data.data);

          // Check for changes in state of switches.
          for (const id in zones.switches) {
            const cached = zoneCache.switches[id];
            const current = zones.switches[id];
            checkForChange(cached, current, 'state', mqtt.publishSwitchState);
          }

          // Check for changes in state of rooms.
          for (const id in zones.rooms) {
            const cached = zoneCache.rooms[id];
            const current = zones.rooms[id];
            checkForChange(cached, current, 'mode', mqtt.publishRoomMode);
            checkForChange(cached, current, 'setpoint', mqtt.publishRoomSetpoint);
            checkForChange(cached, current, 'temperature', mqtt.publishRoomTemperature);
            checkForChange(cached, current, 'battery', mqtt.publishRoomBattery);
            checkForChange(cached, current, 'luminance', mqtt.publishRoomLuminance);
          }
        })
        .catch(error => {
          // handle error
          console.log(error);
        });

      // Repeat after the interval.
      setTimeout(() => {
        next();
      }, pollInterval)
    },
    function(err) {
      // TODO: getting the occasional code:ETIMEDOUT error, which we should probably ignore
      // rather than polluting the log.
      console.error(err);
    }
  );
}

// Make an initial request to fetch all zones and populate cache.
api.fetchZones()
.then(function (response) {
  // handle success
  console.log(`Data for ${response.data.data.length} zones fetched`);
  const zones = parseZoneData(response.data.data);
  zoneCache.houses = zones.houses;
  zoneCache.switches = zones.switches;
  zoneCache.rooms = zones.rooms;

  // Subscribe to MQTT topics.
  subscribe();

  // Trigger the polling.
  run();
})
.catch(function (error) {
  // handle error
  console.log(error);
});
