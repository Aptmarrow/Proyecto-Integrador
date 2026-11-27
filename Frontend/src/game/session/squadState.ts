import type { ServerPlayer } from '../network/wsClient';
import type { PlayerRole } from './gameRuntimeSession';

export type CompanionSlot = {
  id: string;
  name: string;
  role: string;
  icon: string;
  color: string;
  hp: number;
  maxHp: number;
  sp: number;
  maxSp: number;
};

export function normalizeRole(character?: string | null): PlayerRole {
  const value = String(character ?? '').trim().toLowerCase();
  if (value === 'tank' || value === 'defense' || value === 'defence') return 'Tank';
  if (value === 'support' || value === 'healer') return 'Support';
  if (value === 'special_attack' || value === 'special' || value === 'specialattack' || value === 'spatk' || value === 'attack') {
    return 'Special_Attack';
  }
  return 'DPS';
}

export function roleLabel(role: PlayerRole): string {
  if (role === 'Special_Attack') return 'SP.ATK';
  return role.toUpperCase();
}

export function roleIcon(role: PlayerRole): string {
  if (role === 'Tank') return '/assets/sprites/defence.png';
  if (role === 'Support') return '/assets/sprites/healer.png';
  if (role === 'Special_Attack') return '/assets/sprites/specialattack.png';
  return '/assets/sprites/physicalattack.png';
}

export function roleColor(role: PlayerRole): string {
  if (role === 'Tank') return '#10b981';
  if (role === 'Support') return '#ec4899';
  if (role === 'Special_Attack') return '#a855f7';
  return '#00f2fe';
}

export function createDefaultCompanionSlots(): CompanionSlot[] {
  return [];
}

export function mergeCompanionSnapshot(
  prevSlots: CompanionSlot[],
  players: ServerPlayer[],
  myPlayerId: string,
  usernamesById?: Record<string, string>
): CompanionSlot[] {
  if (!Array.isArray(players)) return prevSlots.length === 0 ? prevSlots : [];

  const teammates = players.filter((p) => p.id && p.id !== myPlayerId);
  if (teammates.length === 0) {
    return prevSlots.length === 0 ? prevSlots : [];
  }

  let changed = teammates.length !== prevSlots.length;
  const nextSlots: CompanionSlot[] = new Array(teammates.length);

  for (let i = 0; i < teammates.length; i++) {
    const remote = teammates[i];
    const role = normalizeRole(remote.character);
    const nextMaxHp = Math.round(remote.maxHp ?? 100);
    const nextMaxSp = Math.round(remote.maxSp ?? 1000);
    const nextHp = Math.round(typeof remote.hp === 'number' ? remote.hp : nextMaxHp);
    const nextSp = Math.round(typeof remote.sp === 'number' ? remote.sp : 0);
    const displayName = usernamesById?.[remote.id] || `P-${remote.id.slice(0, 4)}`;
    const nextRole = roleLabel(role);
    const nextIcon = roleIcon(role);
    const nextColor = remote.characterColor || roleColor(role);

    const prev = prevSlots[i];
    if (
      !changed &&
      prev &&
      prev.id === remote.id &&
      prev.name === displayName &&
      prev.role === nextRole &&
      prev.hp === nextHp &&
      prev.maxHp === nextMaxHp &&
      prev.sp === nextSp &&
      prev.maxSp === nextMaxSp &&
      prev.color === nextColor
    ) {
      nextSlots[i] = prev;
    } else {
      changed = true;
      nextSlots[i] = {
        id: remote.id,
        name: displayName,
        role: nextRole,
        icon: nextIcon,
        hp: nextHp,
        maxHp: nextMaxHp,
        sp: nextSp,
        maxSp: nextMaxSp,
        color: nextColor,
      };
    }
  }

  return changed ? nextSlots : prevSlots;
}

