import type { FunctionalComponent } from 'preact';
import { h, Fragment } from 'preact';
import { useState, useEffect, useRef, StateUpdater } from 'preact/hooks';

// provided by https://www.emgoto.com/react-table-of-contents/
const useIntersectionObserver = (setActiveHeadings: StateUpdater<string[]>) => {
  useEffect(() => {
    const callback: IntersectionObserverCallback = (
      sections: IntersectionObserverEntry[]
    ) => {
      setActiveHeadings(
        sections
          .filter((section) => section.intersectionRatio > 0)
          .map((section) => section.target.children[0].getAttribute('id'))
      );
    };

    const observer = new IntersectionObserver(callback);

    const headingElements = Array.from(
      document.querySelectorAll('article.content section')
    );

    // Have the observer watch each `<section/>` that has a heading in it
    headingElements.forEach((element) => {
      observer.observe(element);
    });

    return () => observer.disconnect();
  }, [setActiveHeadings]);
};

const TableOfContents: FunctionalComponent<{ headers: any[] }> = ({
  headers = [],
}) => {
  const [activeHeadings, setActiveHeadings] = useState<string[]>([]);
  useIntersectionObserver(setActiveHeadings);

  return (
    <>
      <h2 class="heading">On this page</h2>
      <ul>
        <li
          class={`header-link depth-2 ${
            activeHeadings.includes('overview') ? 'active' : ''
          }`.trim()}
        >
          <a href="#overview">Overview</a>
        </li>
        {headers
          .filter(({ depth }) => depth > 1 && depth < 4)
          .map((header) => (
            <li
              key={header.slug}
              class={`header-link depth-${header.depth} ${
                activeHeadings.includes(header.slug) ? 'active' : ''
              }`.trim()}
            >
              <a href={`#${header.slug}`}>{header.text}</a>
            </li>
          ))}
      </ul>
    </>
  );
};

export default TableOfContents;
