import axios from 'axios';

const MAPBOX_TOKEN = process.env.MAPBOX_TOKEN;

export async function getDrivingDistanceKm(origin, destination) {
  // origin, destination: [lng, lat]
  const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${origin[0]},${origin[1]};${destination[0]},${destination[1]}?access_token=${MAPBOX_TOKEN}`;
  const response = await axios.get(url);
  const routes = response.data.routes;
  if (!routes || routes.length === 0) throw new Error('No route found');
  // distance in meters
  const meters = routes[0].distance;
  return meters / 1000;
} 