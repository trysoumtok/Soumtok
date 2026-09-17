export type AttachedPluginSkill = {
  id: string
  skillId?: string
  label?: string
  pluginId?: string
  pluginName?: string
  description?: string
  insert?: string
  sourceUrl?: string
  body?: string
}

export {
  githubBlobToRaw,
  pluginSkillReadName,
  flattenInstalledPluginSkills,
  findPluginSkill,
  formatAttachedPluginSkillsBlock,
} from './pluginSkillsRuntime.ts'
