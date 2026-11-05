import type { ActionInput, ExplanationMessage, HandRecord } from '@poker/protocol';

export type Card = HandRecord['board'][number];
export type PlayerId = HandRecord['heroId'];
export type ActionKind = ActionInput['kind'];
export type Message = ExplanationMessage;
