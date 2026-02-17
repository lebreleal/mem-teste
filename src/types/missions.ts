/**
 * Domain types for the Missions / Gamification system.
 */

export interface MissionDefinition {
  id: string;
  key: string;
  title: string;
  description: string;
  icon: string;
  category: 'daily' | 'weekly' | 'achievement';
  target_value: number;
  target_type: string;
  reward_credits: number;
  sort_order: number;
}

export interface UserMission {
  id: string;
  user_id: string;
  mission_id: string;
  progress: number;
  is_completed: boolean;
  is_claimed: boolean;
  period_start: string;
  completed_at: string | null;
  claimed_at: string | null;
}

export interface MissionWithProgress extends MissionDefinition {
  userMission?: UserMission;
  currentProgress: number;
  isCompleted: boolean;
  isClaimed: boolean;
}
