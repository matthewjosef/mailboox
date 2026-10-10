<script lang="ts">
  import "leaflet/dist/leaflet.css";

  import L from "leaflet";
  import { onDestroy, onMount } from "svelte";

  import { pinCenter, roundPin } from "../library/geo";
  import type { RoundedPin } from "../library/types";

  let { pin, onpick }: { pin: RoundedPin | null; onpick: (pin: RoundedPin) => void } = $props();

  // OpenStreetMap's volunteer tile servers: fine for a neighbourhood tool's light use, with attribution.
  // See https://operations.osmfoundation.org/policies/tiles/ before heavier use.
  const TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
  const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

  let container: HTMLDivElement;
  let map: L.Map | undefined;
  let cell: L.Rectangle | undefined;
  let locating = $state(false);
  let locateError = $state<string | null>(null);

  /** Neighbours only ever see this ~1 km square, never the spot you clicked. */
  function showCell(p: RoundedPin) {
    const [lat, lng] = pinCenter(p);
    const bounds: L.LatLngBoundsExpression = [
      [lat - 0.005, lng - 0.005],
      [lat + 0.005, lng + 0.005],
    ];
    if (cell) cell.setBounds(bounds);
    else cell = L.rectangle(bounds, { color: "#b5532f", weight: 2, fillOpacity: 0.2 }).addTo(map!);
  }

  function pick(lat: number, lng: number) {
    const rounded = roundPin(lat, lng);
    showCell(rounded);
    onpick(rounded);
    // At world zoom the ~1 km square is invisible; zoom in so people see what's shared.
    if (map && map.getZoom() < 12) map.setView(pinCenter(rounded), 13);
  }

  function useMyLocation() {
    locateError = null;
    if (!navigator.geolocation) {
      locateError = "This browser can't share its location. Tap the map instead.";
      return;
    }
    locating = true;
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        locating = false;
        pick(coords.latitude, coords.longitude);
      },
      () => {
        locating = false;
        locateError = "Couldn't get your location. Tap the map instead.";
      },
      { enableHighAccuracy: false, timeout: 10000 },
    );
  }

  onMount(() => {
    map = L.map(container, { worldCopyJump: true }).setView(pin ? pinCenter(pin) : [20, 0], pin ? 14 : 2);
    L.tileLayer(TILES, { maxZoom: 18, attribution: ATTRIBUTION }).addTo(map);
    if (pin) showCell(pin);
    map.on("click", (e: L.LeafletMouseEvent) => pick(e.latlng.lat, e.latlng.lng));
  });

  onDestroy(() => map?.remove());
</script>

<div class="picker">
  <div class="map" bind:this={container}></div>
  <div class="row">
    <button type="button" onclick={useMyLocation} disabled={locating}>
      {locating ? "Finding you…" : "Use my location"}
    </button>
    <span class="muted hint">or tap the map. Only the shaded ~1 km square is shared.</span>
  </div>
  {#if locateError}<p class="muted">{locateError}</p>{/if}
</div>

<style>
  .map {
    height: 320px;
    border-radius: 8px;
    border: 1px solid var(--border);
    z-index: 0;
  }
  .row { display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap; margin-top: 0.5rem; }
  .hint { font-size: 0.85rem; }
</style>
