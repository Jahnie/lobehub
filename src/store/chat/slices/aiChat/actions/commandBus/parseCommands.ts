import type {
  RuntimeMentionedAgent,
  RuntimeSelectedSkill,
  RuntimeSelectedTool,
} from '@lobechat/types';

import type {
  ActionTagCategory,
  ActionTagType,
} from '@/features/ChatInput/InputEditor/ActionTag/types';

export interface ParsedActionTag {
  category: ActionTagCategory;
  label: string;
  type: ActionTagType;
}

export interface ParsedCommand extends ParsedActionTag {}

interface MentionNodeMatch {
  agent: RuntimeMentionedAgent;
  node: any;
}

interface MentionNodeOccurrence {
  label: string;
  metadata: Record<string, unknown>;
  node: any;
}

export interface SingleFirstLineAgentMentionDirectRoute {
  targetAgent: RuntimeMentionedAgent;
}

/**
 * Walk the Lexical JSON tree to find all action-tag nodes.
 * Returns the extracted action tags in document order.
 */
export const parseActionTagsFromEditorData = (
  editorData: Record<string, any> | undefined,
): ParsedActionTag[] => {
  if (!editorData) return [];

  const actionTags: ParsedActionTag[] = [];
  walkNode(editorData.root, actionTags);
  return actionTags;
};

export const parseCommandsFromEditorData = (
  editorData: Record<string, any> | undefined,
): ParsedCommand[] => parseActionTagsFromEditorData(editorData);

export const parseSelectedSkillsFromEditorData = (
  editorData: Record<string, any> | undefined,
): RuntimeSelectedSkill[] => {
  const actionTags = parseActionTagsFromEditorData(editorData);
  const selectedSkills = actionTags.filter((tag) => tag.category === 'skill');

  if (selectedSkills.length === 0) return [];

  const seen = new Set<string>();

  return selectedSkills.reduce<RuntimeSelectedSkill[]>((acc, skill) => {
    const identifier = String(skill.type);
    if (!identifier || seen.has(identifier)) return acc;

    seen.add(identifier);
    acc.push({
      identifier,
      name: skill.label || identifier,
    });

    return acc;
  }, []);
};

export const parseSelectedToolsFromEditorData = (
  editorData: Record<string, any> | undefined,
): RuntimeSelectedTool[] => {
  const actionTags = parseActionTagsFromEditorData(editorData);
  const selectedTools = actionTags.filter((tag) => tag.category === 'tool');

  if (selectedTools.length === 0) return [];

  const seen = new Set<string>();

  return selectedTools.reduce<RuntimeSelectedTool[]>((acc, tool) => {
    const identifier = String(tool.type);
    if (!identifier || seen.has(identifier)) return acc;

    seen.add(identifier);
    acc.push({
      identifier,
      name: tool.label || identifier,
    });

    return acc;
  }, []);
};

/**
 * Walk the editor JSON tree to find all mention nodes (type: 'mention')
 * and extract agent info from their metadata.
 */
export const parseMentionedAgentsFromEditorData = (
  editorData: Record<string, any> | undefined,
): RuntimeMentionedAgent[] => {
  if (!editorData) return [];

  const seen = new Set<string>();
  const mentions = collectAgentMentionOccurrences(editorData.root);

  return mentions.reduce<RuntimeMentionedAgent[]>((agents, mention) => {
    if (seen.has(mention.agent.id)) return agents;

    seen.add(mention.agent.id);
    agents.push(mention.agent);

    return agents;
  }, []);
};

export const parseSingleFirstLineAgentMentionDirectRoute = (
  editorData: Record<string, any> | undefined,
): SingleFirstLineAgentMentionDirectRoute | undefined => {
  if (!editorData) return;

  const allMentions = collectMentionOccurrences(editorData.root);
  if (allMentions.length !== 1) return;

  const mentions = collectAgentMentionOccurrences(editorData.root);
  if (mentions.length !== 1) return;

  const firstMeaningfulNode = findFirstMeaningfulNode(editorData.root);
  if (firstMeaningfulNode !== mentions[0].node) return;

  return { targetAgent: mentions[0].agent };
};

/**
 * Check if editorData contains any meaningful text content
 * besides action-tag nodes (whitespace-only counts as empty).
 */
export const hasNonActionContent = (editorData: Record<string, any> | undefined): boolean => {
  if (!editorData) return false;
  const parts: string[] = [];
  collectText(editorData.root, parts);
  return parts.join('').trim().length > 0;
};

function collectText(node: any, out: string[]): void {
  if (!node) return;
  if (node.type === 'action-tag') return;
  if (node.type === 'text' && typeof node.text === 'string') {
    out.push(node.text);
  }
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      collectText(child, out);
    }
  }
}

function collectAgentMentionOccurrences(node: any): MentionNodeMatch[] {
  const mentions: MentionNodeMatch[] = [];
  for (const mention of collectMentionOccurrences(node)) {
    // Only accept explicit agent mentions — skip topics, ALL_MEMBERS, and other types
    if (mention.metadata?.type !== 'agent') continue;
    const id = mention.metadata?.id as string | undefined;
    if (!id) continue;

    mentions.push({
      agent: { id, name: mention.label || id },
      node: mention.node,
    });
  }
  return mentions;
}

function collectMentionOccurrences(node: any): MentionNodeOccurrence[] {
  const mentions: MentionNodeOccurrence[] = [];
  walkMentionNode(node, (mentionNode, label, metadata) => {
    mentions.push({ label, metadata, node: mentionNode });
  });
  return mentions;
}

function findFirstMeaningfulNode(node: any): any | undefined {
  if (!node) return;

  if (node.type === 'text') {
    return typeof node.text === 'string' && node.text.trim().length > 0 ? node : undefined;
  }

  if (node.type === 'mention' || node.type === 'action-tag') return node;

  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      const meaningfulNode = findFirstMeaningfulNode(child);
      if (meaningfulNode) return meaningfulNode;
    }
  }
}

function walkMentionNode(
  node: any,
  cb: (node: any, label: string, metadata: Record<string, unknown>) => void,
): void {
  if (!node) return;
  if (node.type === 'mention' && node.metadata) {
    cb(node, node.label ?? '', node.metadata);
  }
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      walkMentionNode(child, cb);
    }
  }
}

function walkNode(node: any, out: ParsedActionTag[]): void {
  if (!node) return;

  if (node.type === 'action-tag') {
    out.push({
      category: node.actionCategory,
      label: node.actionLabel,
      type: node.actionType,
    });
  }

  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      walkNode(child, out);
    }
  }
}
