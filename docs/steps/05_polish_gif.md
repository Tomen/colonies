# Step 5: Rendering and GIF Export

Finalize presentation features and export capability.

## Tasks
- Implement classical map rendering with WebGL2 layers:
  - Shaded relief
  - Rivers and waterbodies
  - Land‑use tinting
  - Roads, settlements, and industry icons
- Add time‑lapse animations for new edges/buildings and bridge pulses.
- Capture frames and export animated GIF at configured interval.
- Provide minimal JSON configuration example and determinism test seed.
- Update [`docs/architecture.md`](../architecture.md) with rendering and export details.

## Testing & Acceptance
- Exported GIF shows clear progression without flicker.
- Deterministic seeds produce consistent outputs.
- All items in [Definition of Done](../definition_of_done.md) are satisfied.
