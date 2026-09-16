export const MAP_CENTER = [46.7712, 23.6236] as const;
export const MAP_INITIAL_ZOOM = 5;
export const MAP_MAX_ZOOM = 16;

export const STADIA_WATERCOLOR = {
  id: "stadia-watercolor",
  tileUrl: "https://tiles.stadiamaps.com/tiles/stamen_watercolor/{z}/{x}/{y}.jpg",
  options: {
    maxZoom: MAP_MAX_ZOOM,
    attribution:
      '&copy; <a href="https://stadiamaps.com/attribution/" target="_blank">Stadia Maps</a> ' +
      '<a href="https://stamen.com/" target="_blank">&copy; Stamen Design</a> ' +
      '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>'
  }
} as const;
