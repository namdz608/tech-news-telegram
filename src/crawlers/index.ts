import { GitHubReposCrawler } from './github-repos.crawler';
import { HtmlCrawler } from './html.crawler';
import { RssCrawler } from './rss.crawler';
import { XSearchCrawler } from './x-search.crawler';

export function createCrawlers() {
  return {
    rss: new RssCrawler(),
    html: new HtmlCrawler(),
    xSearch: new XSearchCrawler(),
    githubRepos: new GitHubReposCrawler(),
  };
}
