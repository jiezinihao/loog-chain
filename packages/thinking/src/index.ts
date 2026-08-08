/** 思想模块的稳定标识，供唯一入口后续注册。 */
export const thinkingModule = 'thinking';

export { default as ThinkingView } from './ThinkingView.vue';
export { thinkingNotes, type ThinkingNote, type NoteWeight } from './notes';
