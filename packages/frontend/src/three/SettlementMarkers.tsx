import { useMemo } from 'react';
import type { Settlement } from '@colonies/shared';
import { useTerrainHeightStore, getCellHeight } from '../store/terrainHeight';

interface SettlementMarkersProps {
  settlements: Settlement[];
}

// Colors by settlement rank
const RANK_COLORS: Record<Settlement['rank'], number> = {
  hamlet: 0x8b4513, // Saddle brown
  village: 0xd2691e, // Chocolate
  town: 0xdc143c, // Crimson
  city: 0xffd700, // Gold
};

// Sizes by settlement rank (radius, height)
const RANK_SIZES: Record<Settlement['rank'], [number, number]> = {
  hamlet: [3, 6],
  village: [5, 10],
  town: [8, 16],
  city: [12, 24],
};

// Offset above terrain surface
const MARKER_OFFSET = 2;

export function SettlementMarkers({ settlements }: SettlementMarkersProps) {
  const cellHeights = useTerrainHeightStore((s) => s.cellHeights);
  const useHeight = useTerrainHeightStore((s) => s.useHeight);

  const markerData = useMemo(() => {
    if (settlements.length === 0) return null;

    // Calculate position for each settlement
    return settlements.map((settlement) => {
      const [radius, height] = RANK_SIZES[settlement.rank];
      const baseHeight = getCellHeight(settlement.cellId, cellHeights, useHeight);
      const y = baseHeight + MARKER_OFFSET + height / 2;

      return {
        settlement,
        radius,
        height,
        y,
        color: RANK_COLORS[settlement.rank],
      };
    });
  }, [settlements, cellHeights, useHeight]);

  if (!markerData || markerData.length === 0) {
    return null;
  }

  return (
    <group>
      {markerData.map(({ settlement, radius, height, y, color }) => (
        <mesh
          key={settlement.id}
          position={[settlement.position.x, y, settlement.position.y]}
        >
          <coneGeometry args={[radius, height, 6]} />
          <meshBasicMaterial color={color} />
        </mesh>
      ))}
    </group>
  );
}
