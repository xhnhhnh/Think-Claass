import { useQuery } from '@tanstack/react-query';

import { teamQuestsApi, type TeamQuest, type TeamQuestGroupProgress, type StudentCurrentTeamQuestResponse } from '@/api/teamQuests';

export function useTeamQuests(classId: number | null) {
  return useQuery({
    queryKey: ['team-quests', classId],
    queryFn: async () => {
      if (!classId) return [] as TeamQuest[];
      const data = await teamQuestsApi.getTeamQuests(classId);
      return data.data;
    },
    enabled: !!classId,
  });
}

export function useTeamQuestGroupProgress(questId: number | null, classId: number | null, enabled = true) {
  return useQuery({
    queryKey: ['team-quest-group-progress', questId, classId],
    queryFn: async () => {
      if (!questId || !classId) return [] as TeamQuestGroupProgress[];
      const data = await teamQuestsApi.getGroupProgress(questId, classId);
      return data.data;
    },
    enabled: enabled && !!questId && !!classId,
  });
}

export function useStudentCurrentTeamQuest(studentId: number | null) {
  return useQuery({
    queryKey: ['student-current-team-quest', studentId],
    queryFn: async () => {
      if (!studentId) return { success: true, quest: null } as StudentCurrentTeamQuestResponse;
      return teamQuestsApi.getCurrentStudentQuest(studentId);
    },
    enabled: !!studentId,
  });
}
