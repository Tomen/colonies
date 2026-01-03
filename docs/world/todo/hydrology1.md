Below is what I would do, informed by (a) your current V-channel mesh implementation and its shared-edge handling , (b) your proposed “flow splitting + fill-and-spill lakes” plan , and (c) established hydrology/terrain-preprocess literature and the way Red Blob approached rivers in mapgen4. ([simblob.blogspot.com][1])

## 1) Diagnosis: your two problems have different root causes

### Problem 1: Narrow-edge pinching

This is primarily a **rendering/geometry constraint**, not a hydrology constraint.

In your current scheme, the **edge-based bank/floor points are clamped to the shared Voronoi edge length**, via bounds like `min(distToV0, distToV1) * 0.9`, and the perpendicular-component clamp (`effectivePerp`) still leaves you with cases where a high-flow river must “fit through” a very short/narrow edge. 

**Implication:** even “perfect” flow routing will still pinch when the representation forces river width to be realized *on* a short edge.

### Problem 2: Abrupt termination at sinks (`flowsTo = null`)

This is a **hydrology/topology issue**: you have local minima and no depression handling, so the directed flow graph can end internally.

**Implication:** you should add a depression strategy (lakes or sink-filling/breaching). This is a solved problem in DEM preprocessing; the Priority-Flood family is the most practical baseline. ([arXiv][2])

## 2) What the broader ecosystem does (useful reference points)

### A) Depression filling / lakes: Priority-Flood (and variants)

Priority-Flood is a standard algorithm for removing pits (ensuring “every cell drains”), with good performance and a simple implementation; importantly, it can be adapted beyond regular grids and is described as applicable to irregular meshes as well. ([arXiv][2])
Related TIN-oriented work explicitly frames “pit filling and breaching” as the preprocessing step before doing hydrologic analysis on triangulated terrains. ([dccg.upc.edu][3])

### B) Flow splitting: Multiple Flow Direction (MFD) / D-Infinity

If you want split flow (braiding/deltas), you are re-inventing standard “multiple flow direction” routing (MFD, D-Infinity, etc.), which partitions flow among downslope neighbors (typically weighted by slope and sometimes geometry). ([Whitebox Geospatial Inc][4])
This is widely implemented in hydrology tooling; it’s a legitimate approach—but it increases complexity because your accumulation graph is no longer a tree. ([Whitebox Geospatial Inc][4])

### C) Irregular graphs (Voronoi/TIN) are viable for flow accumulation

There is published work on doing flow accumulation on irregularly spaced point networks, using a network approach rather than raster assumptions. This is relevant because your Voronoi adjacency is exactly such a network. ([AGU Publications][5])

### D) Red Blob’s mapgen4 river rendering approach is topological + symbolic

In mapgen4’s writeups, the river “appearance” is treated as categorical cases (source, bend, fork, ocean) and representation is built around the flow graph. ([simblob.blogspot.com][6])
That’s consistent with your approach of encoding geometry per cell/edge, but the pinch you’re seeing is a common side-effect of tying width to polygon edges.

## 3) Recommendation: fix sinks in hydrology; fix pinching in rendering (do not conflate them)

### Step 1 (high ROI): Implement depression handling with Priority-Flood-style “fill-and-spill lakes”

This directly resolves abrupt terminations and gives you lakes “for free” as a byproduct.

Concretely, for a Voronoi graph:

1. Treat boundary/ocean-adjacent cells as “open drains” (initial queue seeds).
2. Run a Priority-Flood over cells (priority by elevation), producing `filledElevation`.
3. Any cell where `filledElevation > originalElevation + ε` is inside a depression “lake basin”.
4. Identify lake components, their spill elevation, and the spill outlet edge/cell during the flood (Priority-Flood variants can track this naturally). ([arXiv][2])
5. For routing, flow within a lake routes to the lake’s outlet; lake surface renders at `waterLevel = spillElevation`.

This aligns with your “Fill-and-Spill Lakes” plan but grounds it in an established algorithmic baseline and reduces corner cases. 

**Practical control knobs (to address “too many lakes”):**

* Only render lakes above `minLakeArea` (you already propose this). 
* Optionally “fill tiny depressions” (treat them as noise) by setting a minimum lake depth or volume threshold before you preserve them as lakes.

### Step 2 (high ROI): Solve edge pinching by decoupling channel width from Voronoi edge length

I would **not** use “edge capacity + flow splitting” as the primary fix for pinching. Capacity is a *hydraulics/erosion* concept; your symptom is geometric: an edge is too short to host a wide trapezoid/V cross-section.  

Instead, pick one of these two rendering strategies:

#### Option A (recommended): Distance-field carving from a river centerline (“carve by proximity”)

1. Build a river *centerline* as segments from cell centroid → downstream centroid (you already compute flow direction vectors). 
2. For each **terrain vertex** (Voronoi vertex), compute distance to nearest river segment (use a simple spatial hash/grid for performance).
3. Carve vertex height by a smooth radial profile:

   * `width(flow)` and `depth(flow)` as you already do (log scaling is fine). 
   * `carve(d) = depth * smoothstep(1, 0, d/(width/2))^p`
4. Water surface: render a separate strip/tube mesh along the centerline at `filledElevation - waterOffset`, or sample a “river surface height field” similar to your existing vertex averaging. 

**Why this works:** The channel width is realized in continuous space, not constrained to a single shared edge segment, so narrow Voronoi edges do not pinch the river.

#### Option B: Keep per-cell V channels, but build a corridor polygon and clip/triangulate

This is heavier: you compute per-segment offset curves (left/right banks) and union them into a corridor polygon, then triangulate it and blend to terrain. It’s robust, but it’s more work than distance-field carving.

**If you want the fewest code changes right now:** Option A is the cleanest conceptual shift and tends to be stable.

### Step 3 (optional): Add flow splitting only if you explicitly want braids/deltas

If your goal is “avoid pinching,” flow splitting is the wrong lever. If your goal is “more realistic distributaries / braided rivers,” then implement standard MFD/D-Infinity-style splitting (weight by slope and optionally by shared-edge length). ([Whitebox Geospatial Inc][4])

If you do this, your accumulation becomes a DAG computation:

* Ensure every target is strictly lower (after depression filling) to preserve acyclicity.
* Accumulate by processing cells in descending (filled) elevation, distributing flow fractions to downstream neighbors.

## 4) A concrete execution plan (minimize risk)

1. **Hydrology correctness first**

   * Implement Priority-Flood and produce `filledElevation`, plus `lakes[]` (cells, waterLevel, outlet). ([arXiv][2])
   * Route flow out of lakes via outlet.
   * Add a test: “every land cell reaches ocean or an explicit lake outlet path.”

2. **Rendering refactor targeted at pinching**

   * Implement distance-field carving using your existing width/depth scalars (keep your log scaling). 
   * Keep your existing water-surface averaging idea, but switch its source from “edge-constrained floor points” to “distance-to-centerline influence”.

3. **Only then evaluate whether you still want flow splitting**

   * If yes, implement MFD/D-Infinity-like splits; do not tie it to “edge capacity” unless you are intentionally modeling choke points. ([Whitebox Geospatial Inc][4])

## 5) Decision matrix for your proposed solutions

* **Fill-and-spill lakes:** Yes. This is the standard fix for sinks; Priority-Flood is the practical baseline. ([arXiv][2])
* **Edge capacity + flow splitting:** Not as a primary fix for pinching. Consider later only for distributaries/braiding. ([Whitebox Geospatial Inc][4])
* **Render decoupling (distance-field carve):** Strongly yes for pinching; it directly addresses the geometric constraint in your current mesh approach. 

If you want, I can also outline the exact data structures and an efficient “nearest river segment” spatial hash that fits your TS/React/Three pipeline, but the key consultative point is: **treat lakes as hydrology preprocessing (Priority-Flood), and treat pinching as a rendering representation problem (distance-field carving or corridor meshing), not as a flow-routing problem.**

[1]: https://simblob.blogspot.com/2018/10/mapgen4-river-representation.html?utm_source=chatgpt.com "Mapgen4: river representation"
[2]: https://arxiv.org/abs/1511.04463?utm_source=chatgpt.com "Priority-Flood: An Optimal Depression-Filling and Watershed-Labeling Algorithm for Digital Elevation Models"
[3]: https://dccg.upc.edu/people/rodrigo/pubs/EmbeddingRivers_IJGIS.pdf?utm_source=chatgpt.com "Embedding Rivers in Triangulated Irregular Networks with ..."
[4]: https://www.whiteboxgeo.com/manual/wbt_book/available_tools/hydrological_analysis.html?utm_source=chatgpt.com "Hydrological analysis - WhiteboxTools User Manual"
[5]: https://agupubs.onlinelibrary.wiley.com/doi/full/10.1029/2018JF004827?utm_source=chatgpt.com "A Network‐Based Flow Accumulation Algorithm for Point ..."
[6]: https://simblob.blogspot.com/2018/09/mapgen4-river-appearance.html?utm_source=chatgpt.com "Mapgen4: river appearance"
