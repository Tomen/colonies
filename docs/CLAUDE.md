# Documentation Guide

This folder contains all project documentation, organized by domain.

## Structure

```
docs/
├── architecture.md      # High-level system design, pluggable layers
├── roadmap.md           # Implementation progress and milestones
├── world/               # Simulation documentation
│   ├── world.md             # MAIN ENTRY POINT - Full simulation design
│   ├── 01_physical_layer/   # Terrain, hydrology, moisture
│   ├── 02_network_layer/    # Pathfinding, roads, bridges
│   ├── exploration/         # Design decisions and option analyses
│   └── todo/                # Pending implementation tasks
├── frontend/            # React + Three.js viewer documentation
└── archive/             # Historical discussions and design conversations
```

## Conventions

### Layer Documentation

Completed simulation layers get numbered folders in `world/`:
- `XX_layer_name/README.md` - Main documentation
- Additional detail files as needed (e.g., `terrain-generation.md`)

Numbering reflects implementation order, not architectural layer order.

### Pending Work

Task files for unimplemented features live in `world/todo/`:
- Keep task-oriented format (Tasks, Testing & Acceptance)
- Move to numbered folder and rewrite as documentation when complete
- Delete from todo/ after completion

### Cross-References

- `architecture.md` links to all layer folders and summarizes the system
- `roadmap.md` tracks completion status and links to both completed and pending docs
- Layer READMEs should link to related files (world.md, other layers)

## When Adding Documentation

1. **New simulation layer**: Create `world/XX_layer_name/README.md`
2. **New frontend feature**: Add to `frontend/` with appropriate structure
3. **Detailed algorithm docs**: Add as separate file in relevant layer folder
4. **Update architecture.md**: Add links to new documentation
5. **Update roadmap.md**: Mark completion status
