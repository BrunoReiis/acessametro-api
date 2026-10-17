import { readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import dotenv from 'dotenv';
import { Prisma, PrismaClient } from '@prisma/client';

dotenv.config();

type StationRecord = {
  name: string;
  line?: string | null;
  zone?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  accessibility?: string | null;
};

type Coordinates = { latitude: number; longitude: number };

type PhotonFeature = {
  properties?: {
    name?: string;
    osm_key?: string;
    osm_value?: string;
    countrycode?: string;
    public_transport?: string;
  };
  geometry?: { coordinates?: number[] };
};

const applyChanges = process.argv.includes('--apply');
const refreshCache = process.argv.includes('--refresh');
const sourceUrl = (process.env.STATIONS_SOURCE_API ?? 'https://acessametro-api.vercel.app/api')
  .replace(/\/+$/, '');
const cachePath = path.join(os.tmpdir(), 'acessametro-station-coordinate-cache.json');
const verifiedOsmCoordinates: Record<string, Coordinates> = {
  '14 bis-saracura': { latitude: -23.5570172, longitude: -46.6491389 },
  consolacao: { latitude: -23.5577451, longitude: -46.6606468 },
  'japao-liberdade': { latitude: -23.5552289, longitude: -46.6358624 },
  'jardim helena-vila mara': { latitude: -23.4926864, longitude: -46.4214717 },
  'jardim sao paulo-ayrton senna': { latitude: -23.4924029, longitude: -46.6170103 },
  'juventus-mooca': { latitude: -23.5580674, longitude: -46.6083148 },
  'patriarca-vila re': { latitude: -23.5310464, longitude: -46.5015767 },
  'villa-lobos-jaguare': { latitude: -23.5459874, longitude: -46.7328528 },
};
const prisma = applyChanges ? new PrismaClient() : undefined;

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('pt-BR');
}

function normalizeStationName(value: string): string {
  return normalizeText(value).replace(/^estacao\s+/, '');
}

function normalizeLine(value?: string | null): string {
  return normalizeText(value ?? '')
    .replace(/^linha\s*/, '')
    .replace(/[^a-z0-9]/g, '');
}

function stationIdentity(station: StationRecord): string {
  return `${normalizeStationName(station.name)}|${normalizeLine(station.line)}`;
}

function isPlaceholder(value?: string | null): boolean {
  return !value || ['consultar', 'a consultar', 'n/a', '-'].includes(normalizeText(value));
}

function validCoordinates(value?: Coordinates | null): value is Coordinates {
  return value !== null && value !== undefined &&
    value.latitude !== 0 && value.longitude !== 0 &&
    value.latitude >= -24.5 && value.latitude <= -22.5 &&
    value.longitude >= -47.8 && value.longitude <= -45;
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function readCoordinateCache(): Promise<Record<string, Coordinates | null>> {
  if (refreshCache) return {};
  try {
    const cache = JSON.parse(await readFile(cachePath, 'utf8')) as Record<string, Coordinates | null>;
    return Object.fromEntries(
      Object.entries(cache).filter(([, coordinates]) => validCoordinates(coordinates)),
    );
  } catch {
    return {};
  }
}

async function geocodeStation(name: string): Promise<Coordinates | null> {
  const query = `${name.replace(/^estação\s+/i, '')}, São Paulo, Brasil`;
  const url = new URL('https://photon.komoot.io/api/');
  url.searchParams.set('q', query);
  url.searchParams.set('limit', '10');

  const response = await fetch(url, {
    headers: { 'User-Agent': 'AcessaMetroStationRepair/1.0' },
  });
  if (response.status === 429) {
    throw new Error('O geocoder limitou as consultas; interrompi sem alterar o banco.');
  }
  if (!response.ok) return null;

  const payload = await response.json() as { features?: PhotonFeature[] };
  const expectedName = normalizeStationName(name);
  const candidates = (payload.features ?? []).filter((feature) => {
    const properties = feature.properties;
    const coordinates = feature.geometry?.coordinates;
    const featureName = normalizeStationName(properties?.name ?? '');
    const stationType = (properties?.osm_key === 'railway' &&
      ['station', 'halt', 'stop', 'tram_stop', 'subway_entrance', 'construction'].includes(properties.osm_value ?? '')) ||
      (properties?.osm_key === 'building' && properties.osm_value === 'train_station') ||
      properties?.public_transport === 'station';
    const nameMatches = featureName === expectedName ||
      (expectedName.length >= 5 && featureName.includes(expectedName));

    return properties?.countrycode?.toUpperCase() === 'BR' &&
      stationType && nameMatches &&
      Array.isArray(coordinates) && coordinates.length >= 2;
  });

  const results = candidates.map((feature) => {
    const properties = feature.properties!;
    const [longitude, latitude] = feature.geometry!.coordinates!;
    const exactName = normalizeStationName(properties.name ?? '') === expectedName;
    const typeRank = properties.osm_key === 'railway' &&
        ['station', 'halt', 'stop', 'tram_stop'].includes(properties.osm_value ?? '')
      ? 3
      : properties.osm_key === 'building' || properties.public_transport === 'station'
        ? 2
        : 1;
    return { latitude, longitude, rank: (exactName ? 10 : 0) + typeRank };
  }).filter(validCoordinates);

  if (results.length === 0) return null;
  const bestRank = Math.max(...results.map((item) => item.rank));
  const bestResults = results.filter((item) => item.rank === bestRank);
  const center = {
    latitude: bestResults.reduce((sum, item) => sum + item.latitude, 0) / bestResults.length,
    longitude: bestResults.reduce((sum, item) => sum + item.longitude, 0) / bestResults.length,
  };
  const spread = bestResults.some((item) => {
    const latitudeDistance = (item.latitude - center.latitude) * 111;
    const longitudeDistance = (item.longitude - center.longitude) * 111 * Math.cos(center.latitude * Math.PI / 180);
    return Math.hypot(latitudeDistance, longitudeDistance) > 0.75;
  });
  return spread ? null : center;
}

async function fetchSourceStations(): Promise<StationRecord[]> {
  const response = await fetch(`${sourceUrl}/stations`);
  if (!response.ok) throw new Error(`API de origem respondeu ${response.status}.`);
  const payload = await response.json() as { data?: StationRecord[] };
  if (!Array.isArray(payload.data)) throw new Error('Resposta da API de origem não contém data[].');
  return payload.data;
}

async function mergeIntoLocalDatabase(
  stations: StationRecord[],
  coordinatesByName: Record<string, Coordinates | null>,
): Promise<{ created: number; updated: number; deduplicated: number }> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL não está configurada.');
  const databaseHost = new URL(databaseUrl).hostname.replace(/^\[|\]$/g, '');
  if (!['localhost', '127.0.0.1', '::1'].includes(databaseHost)) {
    throw new Error('Por segurança, --apply só grava em PostgreSQL local.');
  }
  if (!prisma) throw new Error('Cliente Prisma não inicializado.');

  const uniqueStations = new Map<string, StationRecord>();
  for (const station of stations) uniqueStations.set(stationIdentity(station), station);

  return prisma.$transaction(async (transaction) => {
    const existingStations = await transaction.station.findMany({ orderBy: { createdAt: 'asc' } });
    const groups = new Map<string, typeof existingStations>();
    for (const station of existingStations) {
      const key = stationIdentity(station);
      groups.set(key, [...(groups.get(key) ?? []), station]);
    }

    let deduplicated = 0;
    for (const [key, matches] of groups) {
      if (matches.length < 2) continue;
      const [primary, ...duplicates] = matches;
      for (const duplicate of duplicates) {
        await transaction.incident.updateMany({ where: { stationId: duplicate.id }, data: { stationId: primary.id } });
        await transaction.review.updateMany({ where: { stationId: duplicate.id }, data: { stationId: primary.id } });
        await transaction.station.delete({ where: { id: duplicate.id } });
        deduplicated += 1;
      }
      groups.set(key, [primary]);
    }

    let created = 0;
    let updated = 0;
    for (const station of uniqueStations.values()) {
      const key = stationIdentity(station);
      const existing = groups.get(key)?.[0];
      const cachedCoordinates = coordinatesByName[normalizeStationName(station.name)];
      const sourceCoordinates = station.latitude != null && station.longitude != null
        ? { latitude: station.latitude, longitude: station.longitude }
        : null;
      const coordinates = validCoordinates(sourceCoordinates) ? sourceCoordinates : cachedCoordinates;
      const accessibility = isPlaceholder(station.accessibility) ? undefined : station.accessibility;
      const sharedData = {
        name: station.name.trim(),
        line: station.line?.trim() || null,
        zone: station.zone?.trim() || null,
        ...(accessibility !== undefined ? { accessibility } : {}),
        ...(validCoordinates(coordinates) ? coordinates : {}),
      };

      if (existing) {
        await transaction.station.update({ where: { id: existing.id }, data: sharedData });
        updated += 1;
      } else {
        await transaction.station.create({
          data: { ...sharedData, accessibility: accessibility ?? null },
        });
        created += 1;
      }
    }

    return { created, updated, deduplicated };
  });
}

async function main(): Promise<void> {
  if (applyChanges) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL não está configurada.');
    const host = new URL(databaseUrl).hostname.replace(/^\[|\]$/g, '');
    if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
      throw new Error('--apply está restrito a banco local; o .env atual aponta para remoto.');
    }
  }

  const sourceStations = await fetchSourceStations();
  const names = [...new Set(sourceStations.map((station) => normalizeStationName(station.name)))];
  const nameByKey = new Map(sourceStations.map((station) => [normalizeStationName(station.name), station.name]));
  const coordinatesByName = await readCoordinateCache();
  for (const [name, coordinates] of Object.entries(verifiedOsmCoordinates)) {
    if (!validCoordinates(coordinatesByName[name])) {
      coordinatesByName[name] = coordinates;
    }
  }
  let fetched = 0;

  for (const [index, key] of names.entries()) {
    if (Object.hasOwn(coordinatesByName, key)) continue;
    if (fetched > 0) await sleep(1000);
    coordinatesByName[key] = await geocodeStation(nameByKey.get(key)!);
    fetched += 1;
    if (fetched % 20 === 0) {
      await writeFile(cachePath, JSON.stringify(coordinatesByName), 'utf8');
      console.log(`Geocodificadas ${fetched}/${names.length} estações únicas.`);
    }
    void index;
  }
  await writeFile(cachePath, JSON.stringify(coordinatesByName), 'utf8');

  const resolvedNames = names.filter((name) => validCoordinates(coordinatesByName[name]));
  const unresolvedNames = names.filter((name) => !validCoordinates(coordinatesByName[name]));
  console.log(`Registros recebidos: ${sourceStations.length}`);
  console.log(`Nomes únicos: ${names.length}`);
  console.log(`Coordenadas OSM encontradas: ${resolvedNames.length}`);
  console.log(`Sem correspondência segura: ${unresolvedNames.length}`);
  if (unresolvedNames.length > 0) console.log(`Sem coordenadas: ${unresolvedNames.join(', ')}`);

  if (!applyChanges) {
    console.log('Prévia concluída; use --apply com DATABASE_URL local para gravar.');
    return;
  }

  const result = await mergeIntoLocalDatabase(sourceStations, coordinatesByName);
  console.log(JSON.stringify({ ...result, unresolvedNames: unresolvedNames.length }));
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Falha ao sincronizar estações.');
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma?.$disconnect();
  });