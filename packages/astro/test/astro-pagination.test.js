import { suite } from 'uvu';
import * as assert from 'uvu/assert';
import { doc } from './test-utils.js';
import { setup } from './helpers.js';

const Pagination = suite('Pagination');

setup(Pagination, './fixtures/astro-pagination');

Pagination('generates pagination metadata', async ({ runtime }) => {
  {
    const result = await runtime.load('/first-page-numbered/1');
    assert.ok(!result.error, `build error: ${result.error}`);
    const $ = doc(result.contents);
    assert.equal($('.count').text(), '1–2 of 4');
    assert.equal($('.prev').attr('href'), '#'); // this is first page; should be missing
    assert.equal($('.next').attr('href'), '/first-page-numbered/2'); // this should be a nothing
  }
  {
    const result = await runtime.load('/first-page-numbered/2');
    assert.ok(!result.error, `build error: ${result.error}`);
    const $ = doc(result.contents);
    assert.equal($('.count').text(), '3–4 of 4');
    assert.equal($('.prev').attr('href'), '/first-page-numbered/1');
    assert.equal($('.next').attr('href'), '#');
  }
});

Pagination('generates pagination with first page numbered', async ({ runtime }) => {
  const result = await runtime.load('/first-page-numbered/1');
  assert.ok(!result.error, `build error: ${result.error}`);
  const $ = doc(result.contents);
  assert.equal($('.prev').attr('href'), '#'); // this is first page; should be missing
  assert.equal($('.next').attr('href'), '/first-page-numbered/2'); // this should be a nothing
});

Pagination('generates pagination with first page root', async ({ runtime }) => {
  const result = await runtime.load('/first-page-root');
  assert.ok(!result.error, `build error: ${result.error}`);
  const $ = doc(result.contents);
  assert.equal($('.prev').attr('href'), '#'); // this is first page; should be missing
  assert.equal($('.next').attr('href'), '/first-page-root/2'); // this should be a nothing
});

Pagination('generates pagination with custom "page" param', async ({ runtime }) => {
  const result = await runtime.load('/custom-param-name/1');
  assert.ok(!result.error, `build error: ${result.error}`);
  const $ = doc(result.contents);
  assert.equal($('.prev').attr('href'), '#'); // this is first page; should be missing
  assert.equal($('.next').attr('href'), '/custom-param-name/2'); // this should be a nothing
});




Pagination.run();
