class RouteManager {
    staticRoutes: Record<string, PageLocation> = {};
    collections: Record<string, PageLocation> = {};
  
    async load(snowpackRuntime: SnowpackServerRuntime, astroConfig: AstroConfig) {
      const cwd = fileURLToPath(astroConfig.pages);
      const files = await glob('**/*.{astro,md}', { cwd, filesOnly: true });
      for (const f of files) {
        const pagesPath = astroConfig.pages.pathname.replace(astroConfig.projectRoot.pathname, '');
        const snowpackURL = `/_astro/${pagesPath}${f}.js`;
        if (path.basename(f).startsWith('$')) {
          const reqURL = '/' + slash(f).replace(/\.(astro|md)$/, '').replace(/(^|[\/])\$/, '$1').replace(/index$/, '');
          this.collections[reqURL] = { snowpackURL, fileURL: new URL(f, astroConfig.pages) };
        } else {
          const reqURL = '/' + slash(f).replace(/\.(astro|md)$/, '').replace(/index$/, '');
          this.staticRoutes[reqURL] = { snowpackURL, fileURL: new URL(f, astroConfig.pages) };
        }
      }
      // console.log(this.collections, this.staticRoutes);
      // TODO: hook into snowpack's onFileChanged to stay updated
    }
  
    match(req: URL): SearchResult {
      const reqPath = decodeURI(req.pathname);
      if (this.staticRoutes[reqPath]) {
        return {
          statusCode: 200,
          location: this.staticRoutes[reqPath],
          pathname: reqPath,
        }
      }
      let collectionMatchState = reqPath;
      do {
        console.log(collectionMatchState, this.collections);
        if (this.collections[collectionMatchState]) {
          return {
            statusCode: 200,
            location: this.collections[collectionMatchState],
            pathname: reqPath,
          }
        }
        collectionMatchState = collectionMatchState.substring(0, collectionMatchState.lastIndexOf('/'))
      } while (collectionMatchState.length > 0);
      return {
        statusCode: 404
      };
      // TODO: check the internal route mapping
    }
  }