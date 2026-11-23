export type Git = (...args: string[]) => string;

// Agent sandboxes clone shallowly and may lack origin/<branch>; a diff against it then fails.
export function prepareBase(git: Git, base: string): void {
  const branch = /^origin\/([\w./-]+)$/.exec(base)?.[1];
  if (branch === undefined) return;

  const refspec = `+refs/heads/${branch}:refs/remotes/origin/${branch}`;
  if (git('rev-parse', '--is-shallow-repository').trim() === 'true') {
    git('fetch', '--quiet', '--no-tags', '--unshallow', 'origin', refspec);
  } else if (!hasCommit(git, base)) {
    git('fetch', '--quiet', '--no-tags', 'origin', refspec);
  }
}

function hasCommit(git: Git, ref: string): boolean {
  try {
    git('rev-parse', '--verify', '--quiet', `${ref}^{commit}`);
    return true;
  } catch {
    return false;
  }
}
