import express, { Router } from 'express';
import { z } from 'zod';
import { requireAdmin } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import * as data from '../db/electionData.js';
import { DataError } from '../db/electionData.js';

const router = Router();
router.use(requireAdmin());
// Election imports are multi-megabyte; app.js skips its 10kb parser for
// /api/admin/data so this one governs the whole admin data surface.
router.use(express.json({ limit: '30mb' }));

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color must be #rrggbb');
const partyCode = z.string().trim().min(1).max(80);

const partyCreateSchema = z.object({
  code: partyCode,
  name: z.string().trim().min(1).max(120),
  color: hexColor,
  aliases: z.array(z.string().trim().min(1)).max(20).default([]),
});

const partyPatchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  color: hexColor.optional(),
  aliases: z.array(z.string().trim().min(1)).max(20).optional(),
});

const statePatchSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

const alliancesPutSchema = z.object({
  alliances: z
    .array(
      z.object({
        code: z.string().trim().min(1).max(12),
        name: z.string().trim().min(1).max(120),
        color: hexColor,
        parties: z.array(partyCode).min(1).max(40),
      })
    )
    .max(12),
});

const constituencyPutSchema = z.object({
  ac_name: z.string().trim().min(1).max(120).optional(),
  declared: z.boolean().optional(),
  candidates: z
    .array(
      z.object({
        candidate: z.string().trim().min(1).max(160),
        party: partyCode,
        votes: z.number().int().min(0).max(10_000_000),
      })
    )
    .min(1)
    .max(300)
    .optional(),
});

function handle(fn) {
  return async (req, res, next) => {
    try {
      await fn(req, res);
    } catch (err) {
      if (err instanceof DataError) {
        return res.status(err.status).json({ error: err.message });
      }
      next(err);
    }
  };
}

function parseYear(req) {
  if (!/^[0-9]{4}$/.test(req.params.year)) throw new DataError(404, 'Unknown state or year');
  return Number(req.params.year);
}

// ------------------------------------------------------------- parties

router.post('/parties', validate(partyCreateSchema), handle(async (req, res) => {
  res.status(201).json({ party: await data.createParty(req.body) });
}));

router.patch('/parties/:code', validate(partyPatchSchema), handle(async (req, res) => {
  res.json({ party: await data.updateParty(req.params.code, req.body) });
}));

router.delete('/parties/:code', handle(async (req, res) => {
  await data.deleteParty(req.params.code);
  res.status(204).end();
}));

// -------------------------------------------------------------- states

router.patch('/states/:slug', validate(statePatchSchema), handle(async (req, res) => {
  res.json({ state: await data.updateState(req.params.slug, req.body) });
}));

// ------------------------------------------------------------- exports

router.get('/export/parties', handle(async (req, res) => {
  res.setHeader('Content-Disposition', 'attachment; filename="parties.json"');
  res.json(await data.getParties());
}));

router.get('/export/alliances', handle(async (req, res) => {
  res.setHeader('Content-Disposition', 'attachment; filename="alliances.json"');
  res.json(await data.exportAlliances());
}));

router.get('/export/:state/:year/results', handle(async (req, res) => {
  const year = parseYear(req);
  const view = await data.getResults(req.params.state, year);
  if (!view) throw new DataError(404, 'Unknown state or year');
  const parties = await data.getParties();
  const nameOf = new Map(parties.map((p) => [p.code, p.name]));
  // Raw-compatible shape so an export can be re-imported (or committed
  // under data/raw/results/) without translation.
  const raw = view.constituencies.map((c) => ({
    ac_no: c.ac_no,
    ac_name: c.ac_name,
    declared: c.declared,
    candidates: c.candidates.map((cd) => ({
      Candidate: cd.candidate,
      Party: nameOf.get(cd.party) ?? cd.party,
      'Total Votes': cd.votes,
    })),
  }));
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${req.params.state}-${year}.json"`
  );
  res.json(raw);
}));

// ----------------------------------------------------- per-election data

router.put('/:state/:year/alliances', validate(alliancesPutSchema), handle(async (req, res) => {
  const year = parseYear(req);
  const view = await data.replaceAlliances(req.params.state, year, req.body.alliances);
  res.json({ summary: view.summary });
}));

router.put(
  '/:state/:year/constituencies/:acNo',
  validate(constituencyPutSchema),
  handle(async (req, res) => {
    const year = parseYear(req);
    if (!/^\d{1,3}$/.test(req.params.acNo)) throw new DataError(404, 'Unknown constituency');
    const constituency = await data.updateConstituency(
      req.params.state,
      year,
      Number(req.params.acNo),
      req.body
    );
    res.json({ constituency });
  })
);

router.post('/:state/:year', handle(async (req, res) => {
  const year = parseYear(req);
  if (year < 1950 || year > 2100) throw new DataError(400, 'Implausible year');
  if (!Array.isArray(req.body) || req.body.length === 0 || req.body.length > 600) {
    throw new DataError(400, 'Body must be a non-empty array of raw constituency rows');
  }
  const report = await data.createElection(req.params.state, year, req.body);
  res.status(201).json(report);
}));

router.delete('/:state/:year', handle(async (req, res) => {
  const year = parseYear(req);
  await data.deleteElection(req.params.state, year);
  res.status(204).end();
}));

export default router;
