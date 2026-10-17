import { agent } from "./agent";
import { conversation } from "./conversation";
import { maps } from "./maps";
import { settings } from "./settings";
import { shell } from "./shell";
import { trajectory } from "./trajectory";
import { workspaces } from "./workspaces";

export const zhCN = {
  ...shell,
  ...conversation,
  ...agent,
  ...settings,
  ...workspaces,
  ...maps,
  ...trajectory,
} as const;
