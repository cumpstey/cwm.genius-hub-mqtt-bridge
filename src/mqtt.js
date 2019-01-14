const mqtt = require('mqtt');

const client = mqtt.connect(process.env.MQTT_URL)

// client.on('connect', function () {
//   // TODO: subscribe to ST formats. This requires subsribing to a precise set of topics, not a general prefix + wildcard.
//   client.subscribe('genius/#');
// });
 
client.on('message', function (topic, message) {
  console.log(`Received: ${topic}: ${message.toString()}`);

  var parts = topic.split('/');
  var type = parts.length > 2 ? parts[2] : null;
  if (subscriptions[type]) {
    for (let i = 0; i < subscriptions[type].length; i++) {
      subscriptions[type][i](parts[1], message.toString());
    }
  }
});

const subscribeDevice = name => {
  const topic = `genius/${name}/#`;
  client.subscribe(topic);
  console.log(`Subscribed to topic ${topic}`);
}

const subscriptions = {
  switch: [],
  heatingSetpoint: [],
  thermostatMode: [],
};

const subscribeAttribute = (type, callback) => {
  if (subscriptions[type]) {
    subscriptions[type].push(callback);
  }
}

const publishSwitchState = $switch => {
  // TODO: publish in a format ST can read
  client.publish(`genius/${$switch.name}/switch`, $switch.state ? 'on' : 'off', { retain: true });
}

const publishRoomMode = room => {
  client.publish(`genius/${room.name}/thermostatMode`, `${room.mode}`, { retain: true });
}

const publishRoomSetpoint = room => {
  client.publish(`genius/${room.name}/heatingSetpoint`, `${room.setpoint}`, { retain: true });
}

const publishRoomTemperature = room => {
  client.publish(`genius/${room.name}/temperature`, `${room.temperature}`, { retain: true });
}

const publishRoomBattery = room => {
  client.publish(`genius/${room.name}/battery`, `${room.battery}`, { retain: true });
}

const publishRoomLuminance = room => {
  client.publish(`genius/${room.name}/luminance`, `${room.luminance}`, { retain: true });
}

module.exports.publishRoomMode = publishRoomMode;
module.exports.publishRoomSetpoint = publishRoomSetpoint;
module.exports.publishRoomTemperature = publishRoomTemperature;
module.exports.publishRoomBattery = publishRoomBattery;
module.exports.publishRoomLuminance = publishRoomLuminance;
module.exports.publishSwitchState = publishSwitchState;
module.exports.subscribeAttribute = subscribeAttribute;
module.exports.subscribeDevice = subscribeDevice;
