let GtfsRealtimeBindings = require('gtfs-realtime-bindings');
let request = require('request');
let io = require('socket.io')(8090);

let busStore = {};

function getBuses() {
  // console.log("Inside getBuses()");
  var buses = [];
  return new Promise((resolve, reject) => {
    var requestSettings = {
      method: 'GET',
      url: 'http://realtime.cota.com/TMGTFSRealTimeWebService/Vehicle/VehiclePositions.pb',
      encoding: null,
      headers: {
        'cache-control': 'no-cache'
      },
      proxy: 'http://proxy.us.abb.com:8080'
    };
    request(requestSettings, function (error, response, body) {
      if (!error && response.statusCode == 200) {
        var feed = GtfsRealtimeBindings.FeedMessage.decode(body);
        for (entity of feed.entity) {
          // if(entity.id == "1002") { console.log([entity.vehicle.position.longitude, entity.vehicle.position.latitude]) }
          if (entity.vehicle) {
            buses.push({
              "id": entity.id,
              "location": [entity.vehicle.position.longitude, entity.vehicle.position.latitude],
              "trip_id": entity.vehicle.trip.trip_id
            });
          }
        }
        resolve(buses);
      } else {
        reject(error);
      }
    });
  });
}

function emitBuses(data) {
  const NUM_SEGMENTS = 2;
  var storeIds = Object.keys(busStore);
  var updateIds = data.map(x => x.id);
  
  for (bus of storeIds) {
    if( updateIds.indexOf(bus) < 0) { // Remove bus from busStore
      delete busStore[bus]; 
      io.emit("busRemoved", {id: bus});
    } else { // Append new point to existing bus
      let pointArray = busStore[bus].locations;
      let x = pointArray.slice(-1)[0];
      let y = data.find( j => j.id == bus ).location;
      
      if( !( x && y && x[0] === y[0] && x[1] === y[1] ) ) {
        pointArray.push( y );
        io.emit("locationUpdate", busStore[bus]);
      } 
  
      while ( pointArray.length > NUM_SEGMENTS ) { pointArray.shift(); }
    }
  }
  var newIds = updateIds.filter( y => storeIds.indexOf(y) < 0 );
  for (newBusId of newIds) { // Add new bus 
    
    newBus = data.find( z => z.id == newBusId );

    busStore[newBus.id] = {};
    busStore[newBus.id].locations = [newBus.location];
    busStore[newBus.id].trip_id = newBus.trip_id;

    io.emit("locationUpdate", busStore[newBus.id]);
  }
  // console.log("Done");
}

const FETCH_INTERVAL = 3000;

setInterval( () => {
  getBuses().then(data => { 
    emitBuses(data)
  }).catch(err => console.log(err));
}, FETCH_INTERVAL);