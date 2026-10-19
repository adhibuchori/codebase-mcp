/** Ports: read-only git history, and the opt-in branch switch. Implemented in adapters/git/. */
import type { Repo } from '../core/model/domain.types.ts';

export interface CommitSummary {
  readonly sha: string;
  readonly date: string;
  readonly author: string;
  readonly subject: string;
}

export interface BlameLine {
  readonly line: number;
  readonly sha: string;
  readonly author: string;
  readonly date: string;
  readonly summary: string;
  readonly text: string;
}

export interface LogOptions {
  readonly limit: number;
  readonly path: string;
  readonly since: string;
  readonly rev: string;
}

export interface PickaxeOptions {
  readonly limit: number;
  readonly path: string;
  readonly text: string;
  readonly regex: boolean;
}

export interface CommitDetail {
  readonly summary: CommitSummary;
  readonly stat: string;
  /** Unified diff with sensitive files removed, at most the requested number of lines. */
  readonly patch: string;
  readonly patchCut: boolean;
}

export interface GitReader {
  isRepo(repo: Repo): Promise<boolean>;
  log(repo: Repo, options: LogOptions): Promise<readonly CommitSummary[]>;
  pickaxe(repo: Repo, options: PickaxeOptions): Promise<readonly CommitSummary[]>;
  blame(
    repo: Repo,
    path: string,
    range: { start: number; end: number },
  ): Promise<readonly BlameLine[]>;
  show(repo: Repo, rev: string, maxLines: number): Promise<CommitDetail>;
}

export interface BranchState {
  /** The checked-out branch, or "" on a detached HEAD. */
  readonly current: string;
  /** Local branches only (refs/heads), sorted. */
  readonly branches: readonly string[];
  /** Tracked files with uncommitted changes, staged or not. */
  readonly changed: number;
}

/** Port: the one change the server can make, switching a repo to a local branch. Off by default. */
export interface GitSwitcher {
  state(repo: Repo): Promise<BranchState>;
  /** Switches to a local branch that exists; never fetches, creates, forces or runs hooks. */
  switchTo(repo: Repo, branch: string): Promise<void>;
}
