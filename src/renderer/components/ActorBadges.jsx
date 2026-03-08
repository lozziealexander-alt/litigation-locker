import React from 'react';
import { colors, spacing, typography, radius } from '../styles/tokens';

export default function ActorBadges({ actors, max = 3 }) {
  if (!actors || actors.length === 0) return null;

  const displayed = actors.slice(0, max);
  const remaining = actors.length - max;

  function getClassificationColor(classification) {
    const colorMap = {
      'bad_actor': '#DC2626',
      'enabler': '#F97316',
      'involved': '#7C3AED',
      'aware': '#2563EB',
      'responsible': '#B91C1C',
      'witness_supportive': '#16A34A',
      'witness_neutral': '#6B7280',
      'witness_hostile': '#DC2626',
      'bystander': '#9CA3AF',
      'corroborator': '#16A34A',
      'self': '#2563EB'
    };
    return colorMap[classification] || '#6B7280';
  }

  function getInitials(name) {
    return name
      .split(' ')
      .map(part => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }

  return (
    <div style={styles.container}>
      {displayed.map((actor, i) => (
        <div
          key={actor.id || i}
          style={{
            ...styles.badge,
            background: `${getClassificationColor(actor.classification)}15`,
            color: getClassificationColor(actor.classification),
            zIndex: displayed.length - i
          }}
          title={`${actor.name} (${actor.classification || 'unknown'})`}
        >
          {getInitials(actor.name)}
        </div>
      ))}
      {remaining > 0 && (
        <div style={styles.moreBadge}>
          +{remaining}
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    marginLeft: spacing.xs
  },
  badge: {
    width: '24px',
    height: '24px',
    borderRadius: radius.full,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    marginLeft: '-6px',
    border: `2px solid ${colors.surface}`,
    cursor: 'default'
  },
  moreBadge: {
    height: '24px',
    paddingLeft: spacing.sm,
    paddingRight: spacing.sm,
    borderRadius: radius.full,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    marginLeft: '-6px',
    background: colors.surfaceAlt,
    color: colors.textMuted,
    border: `2px solid ${colors.surface}`
  }
};
