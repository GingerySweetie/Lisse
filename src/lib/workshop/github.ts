/**
 * 炼金工房 · GitHub REST API 客户端
 *
 * 直接在浏览器里通过 token 访问 GitHub REST API。
 * 所有 token 只存在 localStorage，不上传到任何服务器。
 */

export interface GitHubConfig {
  token: string;
  owner: string;
  repo: string;
}

export interface RepoFile {
  path: string;
  type: 'blob' | 'tree';
  size?: number;
  sha?: string;
}

export interface FileContent {
  path: string;
  content: string;
  sha: string;
  encoding: string;
}

export interface CommitResult {
  sha: string;
  url: string;
  message: string;
}

export class GitHubError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'GitHubError';
    this.status = status;
  }
}

async function ghFetch(
  path: string,
  token: string,
  options: RequestInit = {},
): Promise<Response> {
  const url = `https://api.github.com${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    let msg = `${res.status} ${res.statusText}`;
    try {
      const json = JSON.parse(body);
      if (json.message) msg += `: ${json.message}`;
    } catch {
      if (body) msg += `: ${body.slice(0, 200)}`;
    }
    throw new GitHubError(msg, res.status);
  }
  return res;
}

/** 验证 token 是否有效，返回用户名 */
export async function verifyToken(token: string): Promise<string> {
  const res = await ghFetch('/user', token);
  const data = await res.json();
  return data.login as string;
}

/** 获取仓库基本信息 */
export async function getRepo(cfg: GitHubConfig): Promise<{
  fullName: string;
  defaultBranch: string;
  private: boolean;
  description: string;
}> {
  const res = await ghFetch(`/repos/${cfg.owner}/${cfg.repo}`, cfg.token);
  const d = await res.json();
  return {
    fullName: d.full_name,
    defaultBranch: d.default_branch,
    private: d.private,
    description: d.description ?? '',
  };
}

/** 递归获取仓库所有文件的树（限制1000个文件，超过截断） */
export async function getFileTree(
  cfg: GitHubConfig,
  branch = 'HEAD',
): Promise<RepoFile[]> {
  const res = await ghFetch(
    `/repos/${cfg.owner}/${cfg.repo}/git/trees/${branch}?recursive=1`,
    cfg.token,
  );
  const d = await res.json();
  const items: RepoFile[] = (d.tree ?? [])
    .filter((item: { type: string }) => item.type === 'blob')
    .map((item: { path: string; type: string; size?: number; sha?: string }) => ({
      path: item.path,
      type: item.type as 'blob' | 'tree',
      size: item.size,
      sha: item.sha,
    }));
  return items;
}

/** 读取单个文件内容（base64 解码），返回 UTF-8 字符串 */
export async function readFile(
  cfg: GitHubConfig,
  path: string,
  ref?: string,
): Promise<FileContent> {
  const query = ref ? `?ref=${encodeURIComponent(ref)}` : '';
  const res = await ghFetch(
    `/repos/${cfg.owner}/${cfg.repo}/contents/${encodeURIComponent(path)}${query}`,
    cfg.token,
  );
  const d = await res.json();
  if (Array.isArray(d)) {
    throw new GitHubError(`${path} 是一个目录，不是文件`, 400);
  }
  const content =
    d.encoding === 'base64'
      ? atob(d.content.replace(/\n/g, ''))
      : (d.content as string);
  return {
    path: d.path,
    content,
    sha: d.sha,
    encoding: d.encoding,
  };
}

/** 创建或更新文件，返回提交信息 */
export async function writeFile(
  cfg: GitHubConfig,
  path: string,
  content: string,
  message: string,
  sha?: string,
  branch?: string,
): Promise<CommitResult> {
  const body: Record<string, unknown> = {
    message,
    content: btoa(unescape(encodeURIComponent(content))),
  };
  if (sha) body.sha = sha;
  if (branch) body.branch = branch;

  const res = await ghFetch(
    `/repos/${cfg.owner}/${cfg.repo}/contents/${encodeURIComponent(path)}`,
    cfg.token,
    { method: 'PUT', body: JSON.stringify(body) },
  );
  const d = await res.json();
  return {
    sha: d.commit.sha,
    url: d.commit.html_url ?? '',
    message: d.commit.message ?? message,
  };
}

/** 创建新分支 */
export async function createBranch(
  cfg: GitHubConfig,
  branchName: string,
  fromSha: string,
): Promise<void> {
  await ghFetch(`/repos/${cfg.owner}/${cfg.repo}/git/refs`, cfg.token, {
    method: 'POST',
    body: JSON.stringify({
      ref: `refs/heads/${branchName}`,
      sha: fromSha,
    }),
  });
}

/** 获取分支最新 commit SHA */
export async function getBranchSha(
  cfg: GitHubConfig,
  branch: string,
): Promise<string> {
  const res = await ghFetch(
    `/repos/${cfg.owner}/${cfg.repo}/git/ref/heads/${encodeURIComponent(branch)}`,
    cfg.token,
  );
  const d = await res.json();
  return d.object.sha as string;
}

/** 批量提交多个文件变更（使用 Git Tree API，单次提交更高效） */
export async function batchCommit(
  cfg: GitHubConfig,
  changes: Array<{ path: string; content: string }>,
  message: string,
  branch: string,
): Promise<CommitResult> {
  // 1. 获取当前 branch HEAD commit sha
  const refRes = await ghFetch(
    `/repos/${cfg.owner}/${cfg.repo}/git/ref/heads/${encodeURIComponent(branch)}`,
    cfg.token,
  );
  const refData = await refRes.json();
  const parentSha = refData.object.sha as string;

  // 2. 获取当前 tree sha
  const commitRes = await ghFetch(
    `/repos/${cfg.owner}/${cfg.repo}/git/commits/${parentSha}`,
    cfg.token,
  );
  const commitData = await commitRes.json();
  const baseTreeSha = commitData.tree.sha as string;

  // 3. 创建包含所有变更的新 tree
  const treeItems = changes.map((c) => ({
    path: c.path,
    mode: '100644',
    type: 'blob',
    content: c.content,
  }));
  const treeRes = await ghFetch(
    `/repos/${cfg.owner}/${cfg.repo}/git/trees`,
    cfg.token,
    {
      method: 'POST',
      body: JSON.stringify({ base_tree: baseTreeSha, tree: treeItems }),
    },
  );
  const treeData = await treeRes.json();
  const newTreeSha = treeData.sha as string;

  // 4. 创建新 commit
  const newCommitRes = await ghFetch(
    `/repos/${cfg.owner}/${cfg.repo}/git/commits`,
    cfg.token,
    {
      method: 'POST',
      body: JSON.stringify({
        message,
        tree: newTreeSha,
        parents: [parentSha],
      }),
    },
  );
  const newCommitData = await newCommitRes.json();
  const newCommitSha = newCommitData.sha as string;

  // 5. 更新分支引用
  await ghFetch(
    `/repos/${cfg.owner}/${cfg.repo}/git/refs/heads/${encodeURIComponent(branch)}`,
    cfg.token,
    {
      method: 'PATCH',
      body: JSON.stringify({ sha: newCommitSha }),
    },
  );

  return {
    sha: newCommitSha,
    url: `https://github.com/${cfg.owner}/${cfg.repo}/commit/${newCommitSha}`,
    message,
  };
}

/** 解析 GitHub 仓库 URL 或 owner/repo 字符串 */
export function parseRepoInput(input: string): { owner: string; repo: string } | null {
  const trimmed = input.trim();

  // https://github.com/owner/repo 或 https://github.com/owner/repo.git
  const urlMatch = trimmed.match(/github\.com\/([^/]+)\/([^/\s.]+)/);
  if (urlMatch) {
    return { owner: urlMatch[1], repo: urlMatch[2].replace(/\.git$/, '') };
  }

  // owner/repo
  const slashMatch = trimmed.match(/^([^/\s]+)\/([^/\s]+)$/);
  if (slashMatch) {
    return { owner: slashMatch[1], repo: slashMatch[2].replace(/\.git$/, '') };
  }

  return null;
}
