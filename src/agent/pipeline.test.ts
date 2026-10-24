import test from 'node:test';
import assert from 'node:assert/strict';
import { judge } from './judge';
import { lookup } from './lookup';
import { normalize } from './normalize';
import { runPipeline } from './pipeline';

test('deterministic judge evaluates fair, slightly_high, overpriced, and low-confidence unknown', async () => {
  const bunChaRef = await lookup('bun_cha');
  assert.ok(bunChaRef);

  // 120k vs 70k high -> ratio 1.71 -> overpriced (+71% above high)
  const overVerdict = await judge(
    {
      index: 0,
      perceived: {
        name_vi: 'Bún chả',
        name_en: 'Grilled pork & noodles',
        category: 'street_food',
        price_vnd: 120000,
        unit: 'suất',
        box_2d: [0, 0, 100, 100],
        confidence: 0.95,
      },
      matched_id: 'bun_cha',
      match_score: 1.0,
      normalized_price_vnd: 120000,
      normalized_unit: 'suất',
      needs_confirmation: false,
    },
    bunChaRef
  );
  assert.equal(overVerdict.verdict, 'overpriced');
  assert.equal(overVerdict.pct_above_high, 71);

  // Nem rán 70k vs 55k high -> ratio 1.27 -> slightly_high
  const nemRef = await lookup('nem_ran');
  const highVerdict = await judge(
    {
      index: 1,
      perceived: {
        name_vi: 'Nem rán',
        name_en: 'Spring rolls',
        category: 'street_food',
        price_vnd: 70000,
        unit: 'đĩa',
        box_2d: [0, 0, 100, 100],
        confidence: 0.92,
      },
      matched_id: 'nem_ran',
      match_score: 1.0,
      normalized_price_vnd: 70000,
      normalized_unit: 'đĩa',
      needs_confirmation: false,
    },
    nemRef
  );
  assert.equal(highVerdict.verdict, 'slightly_high');

  // Low confidence (< 0.5) -> unknown ("Not sure")
  const lowConfVerdict = await judge(
    {
      index: 2,
      perceived: {
        name_vi: 'Bún chả',
        name_en: 'Grilled pork',
        category: 'street_food',
        price_vnd: 60000,
        unit: 'suất',
        box_2d: [0, 0, 100, 100],
        confidence: 0.4,
      },
      matched_id: 'bun_cha',
      match_score: 0.9,
      normalized_price_vnd: 60000,
      normalized_unit: 'suất',
      needs_confirmation: false,
    },
    bunChaRef
  );
  assert.equal(lowConfVerdict.verdict, 'unknown');
});

test('demo menu pipeline produces 3 fair, 2 slightly_high, 2 overpriced items and full trace', async () => {
  const res = await runPipeline({ demoMode: true, demoSample: 'menu', stepDelayMs: 0 });
  assert.equal(res.status, 'complete');
  assert.equal(res.evaluatedItems.length, 7);

  const counts = { fair: 0, slightly_high: 0, overpriced: 0, unknown: 0 };
  for (const item of res.evaluatedItems) {
    counts[item.judgment.verdict]++;
  }
  assert.equal(counts.fair, 3);
  assert.equal(counts.slightly_high, 2);
  assert.equal(counts.overpriced, 2);

  const traceIds = (res.perception.trace ?? []).map((t) => t.id);
  assert.deepEqual(traceIds, ['ocr', 'read', 'fuse', 'match', 'lookup', 'maps', 'judge', 'respond']);
  for (const step of res.perception.trace ?? []) {
    assert.equal(typeof step.ms, 'number');
    assert.ok(step.detail.length > 0);
  }
});

test('demo stall pipeline pauses for mango disambiguation and resumes cleanly', async () => {
  const paused = await runPipeline({ demoMode: true, demoSample: 'stall', stepDelayMs: 0 });
  assert.equal(paused.status, 'needs_confirmation');
  assert.equal(paused.questions.length, 1);
  assert.equal(paused.questions[0].prompt_en, 'Which mango is this?');

  // Resume choosing Xoài cát (60-90k/kg) -> 80k/kg is fair
  const resumedCat = await runPipeline({
    demoMode: true,
    demoSample: 'stall',
    existingPerception: paused.perception,
    userConfirmations: { 0: 'xoai_cat' },
    stepDelayMs: 0,
  });
  assert.equal(resumedCat.status, 'complete');
  assert.equal(resumedCat.evaluatedItems[0].judgment.verdict, 'fair');
  const matchStep = resumedCat.perception.trace?.find((t) => t.id === 'match');
  assert.equal(matchStep?.detail, '1 asked you: xoài cát');

  // Resume choosing Xoài Đài Loan (30-45k/kg) -> 80k/kg is overpriced
  const resumedDl = await runPipeline({
    demoMode: true,
    demoSample: 'stall',
    existingPerception: paused.perception,
    userConfirmations: { 0: 'xoai_dai_loan' },
    stepDelayMs: 0,
  });
  assert.equal(resumedDl.status, 'complete');
  assert.equal(resumedDl.evaluatedItems[0].judgment.verdict, 'overpriced');
});

test('"Nấm" (mushroom) is never matched or asked about as Bún bò Nam Bộ / Phở bò', async () => {
  const result = await normalize([
    {
      name_vi: 'Nấm',
      name_en: 'Extra mushrooms',
      category: 'other',
      price_vnd: 5000,
      unit: 'phần',
      box_2d: [0, 0, 10, 10],
      confidence: 0.9,
    },
  ]);
  assert.equal(result.questions.length, 0);
  assert.equal(result.items[0].matched_id, null);
});

test('Gemini catalog matches: add-ons are skipped, alternatives of another kind never trigger a question', async () => {
  const base = { category: 'street_food' as const, unit: 'phần', box_2d: [0, 0, 10, 10] as [number, number, number, number], confidence: 0.9 };
  const result = await normalize([
    { ...base, name_vi: 'Nấm', name_en: 'Mushroom', price_vnd: 5000, is_addon: true, catalog_id: '', match: 'none', alternatives: [] },
    { ...base, name_vi: 'Xoài lắc', name_en: 'Shaken mango', price_vnd: 25000, catalog_id: '', match: 'none', alternatives: ['xoai_cat', 'xoai_dai_loan'] },
    { ...base, name_vi: 'Nem chua rán', name_en: 'Fried nem chua', price_vnd: 40000, catalog_id: 'nem_chua_ran', match: 'exact', alternatives: [] },
  ]);
  assert.equal(result.questions.length, 0);
  assert.deepEqual(result.items.map((i) => i.matched_id), [null, null, 'nem_chua_ran']);
});

test('price context: café raises the ceiling, outside the Old Quarter lowers it, fruit follows its season', async () => {
  const { applyContext } = await import('./context');
  const pho = (await lookup('pho_bo'))!;
  const street = applyContext(pho, { area: 'old_quarter', venue: 'street', date: new Date('2026-10-24') });
  assert.equal(street.reference.high_vnd, pho.high_vnd);
  assert.equal(street.factors.length, 0);

  const cafe = applyContext(pho, { area: 'old_quarter', venue: 'cafe', date: new Date('2026-10-24') });
  assert.ok(cafe.reference.high_vnd > pho.high_vnd);

  const outside = applyContext(pho, { area: 'elsewhere', venue: 'street', date: new Date('2026-10-24') });
  assert.ok(outside.reference.high_vnd < pho.high_vnd);

  const lychee = (await lookup('vai_thieu'))!;
  const june = applyContext(lychee, { area: 'old_quarter', venue: 'street', date: new Date('2026-06-15') });
  const october = applyContext(lychee, { area: 'old_quarter', venue: 'street', date: new Date('2026-10-24') });
  assert.equal(june.factors[0].id, 'in_season');
  assert.equal(october.factors[0].id, 'off_season');
  assert.ok(october.reference.high_vnd > june.reference.high_vnd);

  const tet = applyContext(pho, { area: 'old_quarter', venue: 'street', date: new Date('2027-02-01') });
  assert.ok(tet.factors.some((f) => f.id === 'tet'));
});

test('Google Maps area_kind mapping: tourist_core -> old_quarter, local -> elsewhere, mixed -> old_quarter with venue one step lower', async () => {
  const { applyContext, mapAreaKindToArea, stepDownVenue } = await import('./context');
  const { buildMapsTraceStep } = await import('./maps');
  const bunCha = (await lookup('bun_cha'))!;

  assert.equal(mapAreaKindToArea('tourist_core'), 'old_quarter');
  assert.equal(mapAreaKindToArea('mixed'), 'old_quarter');
  assert.equal(mapAreaKindToArea('local'), 'elsewhere');

  assert.equal(stepDownVenue('tourist'), 'cafe');
  assert.equal(stepDownVenue('cafe'), 'eatery');
  assert.equal(stepDownVenue('eatery'), 'street');
  assert.equal(stepDownVenue('street'), 'street');

  // 1. tourist_core in cafe -> old_quarter + cafe scale, with area_name chip "Hoàn Kiếm · tourist area"
  const touristCoreCafe = applyContext(bunCha, {
    area: 'elsewhere',
    area_kind: 'tourist_core',
    area_name: 'Hoàn Kiếm',
    venue: 'cafe',
    date: new Date('2026-10-24'),
  });
  const pureCafe = applyContext(bunCha, {
    area: 'old_quarter',
    venue: 'cafe',
    date: new Date('2026-10-24'),
  });
  assert.equal(touristCoreCafe.reference.high_vnd, pureCafe.reference.high_vnd);
  assert.ok(touristCoreCafe.factors.some((f) => f.label_en === 'Hoàn Kiếm · tourist area'));

  // 2. mixed in cafe -> old_quarter + eatery scale (venue stepped down one level from cafe -> eatery)
  const mixedCafe = applyContext(bunCha, {
    area: 'old_quarter',
    area_kind: 'mixed',
    area_name: 'Ba Đình',
    venue: 'cafe',
    date: new Date('2026-10-24'),
  });
  const pureEatery = applyContext(bunCha, {
    area: 'old_quarter',
    venue: 'eatery',
    date: new Date('2026-10-24'),
  });
  assert.equal(mixedCafe.reference.high_vnd, pureEatery.reference.high_vnd);
  assert.ok(mixedCafe.reference.high_vnd < touristCoreCafe.reference.high_vnd);
  assert.ok(mixedCafe.factors.some((f) => f.label_en === 'Ba Đình · mixed area'));

  // 3. local in street -> elsewhere scale
  const localStreet = applyContext(bunCha, {
    area: 'old_quarter',
    area_kind: 'local',
    area_name: 'Đống Đa',
    venue: 'street',
    date: new Date('2026-10-24'),
  });
  const pureElsewhere = applyContext(bunCha, {
    area: 'elsewhere',
    venue: 'street',
    date: new Date('2026-10-24'),
  });
  assert.equal(localStreet.reference.high_vnd, pureElsewhere.reference.high_vnd);
  assert.ok(localStreet.factors.some((f) => f.label_en === 'Đống Đa · local area'));

  // 4. Trace step formatting for skipped (no location), unavailable, and grounded
  const skippedStep = buildMapsTraceStep({ hasLocation: false });
  assert.equal(skippedStep.detail, 'skipped · no location');

  const unavailStep = buildMapsTraceStep({
    hasLocation: true,
    contextResult: { unavailable: true },
    ms: 420,
  });
  assert.equal(unavailStep.detail, 'unavailable here');

  const groundedStep = buildMapsTraceStep({
    hasLocation: true,
    contextResult: {
      unavailable: false,
      area_kind: 'tourist_core',
      area_name: 'Hoàn Kiếm',
      summary_en: 'Tourist core',
      summary_vi: 'Khu du lịch',
      sources: [{ title: 'Hoàn Kiếm', uri: 'https://maps.google.com/?cid=1' }],
    },
    ms: 1400,
  });
  assert.equal(groundedStep.detail, 'Google Maps · Hoàn Kiếm, tourist core · 1.4s');
});

test('Part 7: trace maps into 5 plain-language steps and AbortController cancels pipeline cleanly', async () => {
  const { mapTraceToCheckingSteps } = await import('../components/AgentWorkingSheet');
  const { getCrowdStatsForItem } = await import('../lib/storage');

  const res = await runPipeline({ demoMode: true, demoSample: 'menu', stepDelayMs: 0 });
  const steps = mapTraceToCheckingSteps(res.perception.trace ?? [], null);
  assert.equal(steps.length, 5);
  assert.deepEqual(
    steps.map((s) => s.title),
    [
      'Reading the menu',
      'Understanding items',
      'Matching dishes',
      'Checking prices near you',
      'Writing tips',
    ]
  );
  assert.ok(steps.every((s) => s.status === 'done'));

  // Crowd stats for bun_cha default seed
  const crowd = getCrowdStatsForItem('bun_cha');
  assert.ok(crowd);
  assert.equal(crowd.count, 6);
  assert.equal(crowd.median_vnd, 55000);

  // AbortController cancels runPipeline
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    () => runPipeline({ demoMode: true, demoSample: 'menu', stepDelayMs: 50, signal: controller.signal }),
    (err: Error) => err.name === 'AbortError'
  );
});


