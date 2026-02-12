/**
 * 基于 tools/seed-shop-merged-export.json 计算经验收益率
 *
 * 规则：
 * 1) 每次收获经验 = exp（新版已去除铲地+1经验）
 * 2) 种植速度：
 *    - 不施肥：2 秒种 18 块地 => 9 块/秒
 *    - 普通肥：2 秒种 12 块地 => 6 块/秒
 * 3) 普通肥：直接减少一个生长阶段（按 Plant.json 的 grow_phases 取首个非0阶段时长）
 *
 * 用法：
 *   node tools/calc-exp-yield.js
 *   node tools/calc-exp-yield.js --lands 18 --level 27
 *   node tools/calc-exp-yield.js --input tools/seed-shop-merged-export.json
 *
 * 运行时调用：
 *   const { getPlantingRecommendation } = require('../tools/calc-exp-yield');
 *   const rec = getPlantingRecommendation(27, 18);
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_INPUT = path.join(__dirname, 'seed-shop-merged-export.json');
const PLANT_CONFIG_PATH = path.join(__dirname, '..', 'gameConfig', 'Plant.json');
const DEFAULT_OUT_JSON = path.join(__dirname, 'exp-yield-result.json');
const DEFAULT_OUT_CSV = path.join(__dirname, 'exp-yield-result.csv');
const DEFAULT_OUT_TXT = path.join(__dirname, 'exp-yield-summary.txt');

const NO_FERT_PLANTS_PER_2_SEC = 18;
const NORMAL_FERT_PLANTS_PER_2_SEC = 12;
const NO_FERT_PLANT_SPEED_PER_SEC = NO_FERT_PLANTS_PER_2_SEC / 2; // 9 块/秒
const NORMAL_FERT_PLANT_SPEED_PER_SEC = NORMAL_FERT_PLANTS_PER_2_SEC / 2; // 6 块/秒

function toNum(v, fallback = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
}

function parseArgs(argv) {
    const opts = {
        input: DEFAULT_INPUT,
        outJson: DEFAULT_OUT_JSON,
        outCsv: DEFAULT_OUT_CSV,
        outTxt: DEFAULT_OUT_TXT,
        lands: 18,
        level: null,
        top: 20,
    };

    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--input' && argv[i + 1]) opts.input = argv[++i];
        else if (a === '--out-json' && argv[i + 1]) opts.outJson = argv[++i];
        else if (a === '--out-csv' && argv[i + 1]) opts.outCsv = argv[++i];
        else if (a === '--out-txt' && argv[i + 1]) opts.outTxt = argv[++i];
        else if (a === '--lands' && argv[i + 1]) opts.lands = Math.max(1, Math.floor(toNum(argv[++i], 18)));
        else if (a === '--level' && argv[i + 1]) opts.level = Math.max(1, Math.floor(toNum(argv[++i], 1)));
        else if (a === '--top' && argv[i + 1]) opts.top = Math.max(1, Math.floor(toNum(argv[++i], 20)));
        else if (a === '--help' || a === '-h') {
            printHelp();
            process.exit(0);
        }
    }
    return opts;
}

function printHelp() {
    console.log('Usage: node tools/calc-exp-yield.js [options]');
    console.log('');
    console.log('Options:');
    console.log('  --input <path>      输入 JSON 文件路径');
    console.log('  --lands <n>         地块数（默认 18）');
    console.log('  --level <n>         指定账号等级，输出该等级可用最优作物');
    console.log('  --top <n>           摘要 Top 数量（默认 20）');
    console.log('  --out-json <path>   输出 JSON 路径');
    console.log('  --out-csv <path>    输出 CSV 路径');
    console.log('  --out-txt <path>    输出 TXT 路径');
}

function readSeeds(inputPath) {
    const text = fs.readFileSync(inputPath, 'utf8');
    const data = JSON.parse(text);
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.rows)) return data.rows;
    if (data && Array.isArray(data.seeds)) return data.seeds;
    throw new Error('无法识别输入数据格式，需要数组或 rows/seeds 字段');
}

function parseGrowPhases(growPhases) {
    if (!growPhases || typeof growPhases !== 'string') return [];
    return growPhases
        .split(';')
        .map(x => x.trim())
        .filter(Boolean)
        .map(seg => {
            const parts = seg.split(':');
            return parts.length >= 2 ? toNum(parts[1], 0) : 0;
        })
        .filter(sec => sec > 0);
}

function loadSeedPhaseReduceMap() {
    const text = fs.readFileSync(PLANT_CONFIG_PATH, 'utf8');
    const rows = JSON.parse(text);
    if (!Array.isArray(rows)) {
        throw new Error(`Plant 配置格式异常: ${PLANT_CONFIG_PATH}`);
    }

    const map = new Map();
    for (const p of rows) {
        const seedId = toNum(p.seed_id, 0);
        if (seedId <= 0 || map.has(seedId)) continue;
        const phases = parseGrowPhases(p.grow_phases);
        if (phases.length === 0) continue;
        map.set(seedId, phases[0]); // 普通肥减少一个阶段：以首个阶段时长为准
    }
    return map;
}

function calcEffectiveGrowTime(growSec, seedId, seedPhaseReduceMap) {
    const reduce = toNum(seedPhaseReduceMap.get(seedId), 0);
    if (reduce <= 0) return growSec;
    return Math.max(1, growSec - reduce);
}

function formatSec(sec) {
    const s = Math.max(0, Math.round(sec));
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const r = s % 60;
    if (m < 60) return r > 0 ? `${m}m${r}s` : `${m}m`;
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return r > 0 ? `${h}h${mm}m${r}s` : `${h}h${mm}m`;
}

function csvCell(v) {
    const s = v == null ? '' : String(v);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
}

function buildRows(rawSeeds, lands, seedPhaseReduceMap) {
    const plantSecondsNoFert = lands / NO_FERT_PLANT_SPEED_PER_SEC;
    const plantSecondsNormalFert = lands / NORMAL_FERT_PLANT_SPEED_PER_SEC;
    const rows = [];
    let skipped = 0;
    let missingPhaseReduceCount = 0;

    for (const s of rawSeeds) {
        const seedId = toNum(s.seedId || s.seed_id);
        const name = s.name || `seed_${seedId}`;
        const requiredLevel = toNum(s.requiredLevel || s.required_level || 1, 1);
        const price = toNum(s.price, 0);
        const expHarvest = toNum(s.exp, 0);
        const growTimeSec = toNum(s.growTimeSec || s.growTime || s.grow_time || 0, 0);

        if (seedId <= 0 || growTimeSec <= 0) {
            skipped++;
            continue;
        }

        const expPerCycle = expHarvest;
        const reduceSec = toNum(seedPhaseReduceMap.get(seedId), 0);
        if (reduceSec <= 0) missingPhaseReduceCount++;
        const growTimeNormalFert = calcEffectiveGrowTime(growTimeSec, seedId, seedPhaseReduceMap);

        // 整个农场一轮 = 生长时间 + 本轮全部地块种植耗时
        const cycleSecNoFert = growTimeSec + plantSecondsNoFert;
        const cycleSecNormalFert = growTimeNormalFert + plantSecondsNormalFert;

        const farmExpPerHourNoFert = (lands * expPerCycle / cycleSecNoFert) * 3600;
        const farmExpPerHourNormalFert = (lands * expPerCycle / cycleSecNormalFert) * 3600;
        const gainPercent = farmExpPerHourNoFert > 0
            ? ((farmExpPerHourNormalFert - farmExpPerHourNoFert) / farmExpPerHourNoFert) * 100
            : 0;
        const expPerGoldSeed = price > 0 ? expPerCycle / price : 0;

        rows.push({
            seedId,
            goodsId: toNum(s.goodsId || s.goods_id),
            plantId: toNum(s.plantId || s.plant_id),
            name,
            requiredLevel,
            unlocked: !!s.unlocked,
            price,
            expHarvest,
            expPerCycle,
            growTimeSec,
            growTimeStr: s.growTimeStr || formatSec(growTimeSec),
            normalFertReduceSec: reduceSec,
            growTimeNormalFert,
            growTimeNormalFertStr: formatSec(growTimeNormalFert),
            cycleSecNoFert,
            cycleSecNormalFert,
            farmExpPerHourNoFert,
            farmExpPerHourNormalFert,
            farmExpPerDayNoFert: farmExpPerHourNoFert * 24,
            farmExpPerDayNormalFert: farmExpPerHourNormalFert * 24,
            gainPercent,
            expPerGoldSeed,
            fruitId: toNum(s?.fruit?.id || s.fruitId),
            fruitCount: toNum(s?.fruit?.count || s.fruitCount),
        });
    }

    return { rows, skipped, plantSecondsNoFert, plantSecondsNormalFert, missingPhaseReduceCount };
}

function pickTop(rows, key, topN) {
    return [...rows]
        .sort((a, b) => b[key] - a[key])
        .slice(0, topN);
}

function buildBestByLevel(rows) {
    const maxLevel = rows.reduce((m, r) => Math.max(m, r.requiredLevel), 1);
    const result = [];
    for (let lv = 1; lv <= maxLevel; lv++) {
        // 按用户指定等级做理论可种分析，不受商店 unlocked 状态影响
        const available = rows.filter(r => r.requiredLevel <= lv);
        if (available.length === 0) continue;
        const bestNo = pickTop(available, 'farmExpPerHourNoFert', 1)[0];
        const bestFert = pickTop(available, 'farmExpPerHourNormalFert', 1)[0];
        result.push({
            level: lv,
            bestNoFert: {
                seedId: bestNo.seedId,
                name: bestNo.name,
                expPerHour: Number(bestNo.farmExpPerHourNoFert.toFixed(2)),
            },
            bestNormalFert: {
                seedId: bestFert.seedId,
                name: bestFert.name,
                expPerHour: Number(bestFert.farmExpPerHourNormalFert.toFixed(2)),
            },
        });
    }
    return result;
}

function writeJson(outPath, payload) {
    fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8');
}

function writeCsv(outPath, rows) {
    const headers = [
        'seedId',
        'name',
        'requiredLevel',
        'price',
        'expHarvest',
        'expPerCycle',
        'growTimeSec',
        'growTimeNormalFert',
        'cycleSecNoFert',
        'cycleSecNormalFert',
        'farmExpPerHourNoFert',
        'farmExpPerHourNormalFert',
        'farmExpPerDayNoFert',
        'farmExpPerDayNormalFert',
        'gainPercent',
        'expPerGoldSeed',
    ];
    const lines = [headers.join(',')];
    for (const r of rows) {
        lines.push(headers.map(h => csvCell(r[h])).join(','));
    }
    fs.writeFileSync(outPath, `${lines.join('\n')}\n`, 'utf8');
}

function writeSummaryTxt(outPath, opts, meta, topNo, topFert, levelInfo) {
    const lines = [];
    lines.push('经验收益率分析结果');
    lines.push('');
    lines.push(`数据源: ${meta.input}`);
    lines.push(`导出时间: ${new Date().toISOString()}`);
    lines.push(`地块数: ${opts.lands}`);
    lines.push(`种植速度(不施肥): ${NO_FERT_PLANTS_PER_2_SEC}块/${2}s (${NO_FERT_PLANT_SPEED_PER_SEC}块/s)`);
    lines.push(`种植速度(普通肥): ${NORMAL_FERT_PLANTS_PER_2_SEC}块/${2}s (${NORMAL_FERT_PLANT_SPEED_PER_SEC}块/s)`);
    lines.push(`整场种植耗时(不施肥): ${formatSec(meta.plantSecondsNoFert)}`);
    lines.push(`整场种植耗时(普通肥): ${formatSec(meta.plantSecondsNormalFert)}`);
    lines.push(`普通肥规则: 直接减少一个生长阶段（按 Plant.json 的首个阶段时长）`);
    lines.push(`缺少阶段配置的种子数: ${meta.missingPhaseReduceCount}`);
    lines.push('');

    lines.push(`Top ${topNo.length}（不施肥，按每小时经验）`);
    lines.push('排名 | 名称 | Lv需 | 生长 | 单轮经验 | 每小时经验');
    topNo.forEach((r, i) => {
        lines.push(
            `${String(i + 1).padStart(2)} | ${r.name} | ${r.requiredLevel} | ${r.growTimeStr} | ${r.expPerCycle} | ${r.farmExpPerHourNoFert.toFixed(2)}`
        );
    });
    lines.push('');

    lines.push(`Top ${topFert.length}（普通肥，按每小时经验）`);
    lines.push('排名 | 名称 | Lv需 | 肥后生长 | 单轮经验 | 每小时经验 | 提升');
    topFert.forEach((r, i) => {
        lines.push(
            `${String(i + 1).padStart(2)} | ${r.name} | ${r.requiredLevel} | ${r.growTimeNormalFertStr} | ${r.expPerCycle} | ${r.farmExpPerHourNormalFert.toFixed(2)} | ${r.gainPercent.toFixed(2)}%`
        );
    });
    lines.push('');

    if (levelInfo) {
        lines.push(`当前等级 Lv${levelInfo.level} 推荐`);
        lines.push(`不施肥: ${levelInfo.bestNoFert.name}(seed=${levelInfo.bestNoFert.seedId}) -> ${levelInfo.bestNoFert.expPerHour.toFixed(2)} exp/h`);
        lines.push(`普通肥: ${levelInfo.bestNormalFert.name}(seed=${levelInfo.bestNormalFert.seedId}) -> ${levelInfo.bestNormalFert.expPerHour.toFixed(2)} exp/h`);
        lines.push('');
    }

    fs.writeFileSync(outPath, `${lines.join('\n')}\n`, 'utf8');
}

function analyzeExpYield(opts = {}) {
    const lands = Math.max(1, Math.floor(toNum(opts.lands, 18)));
    const level = opts.level == null ? null : Math.max(1, Math.floor(toNum(opts.level, 1)));
    const top = Math.max(1, Math.floor(toNum(opts.top, 20)));
    const input = opts.input || DEFAULT_INPUT;
    const inputAbs = path.resolve(input);
    const rawSeeds = readSeeds(inputAbs);
    const seedPhaseReduceMap = loadSeedPhaseReduceMap();
    const { rows, skipped, plantSecondsNoFert, plantSecondsNormalFert, missingPhaseReduceCount } = buildRows(rawSeeds, lands, seedPhaseReduceMap);

    if (rows.length === 0) {
        throw new Error('没有可计算的种子数据（请检查输入文件）');
    }

    const topNo = pickTop(rows, 'farmExpPerHourNoFert', top);
    const topFert = pickTop(rows, 'farmExpPerHourNormalFert', top);
    const bestByLevel = buildBestByLevel(rows);

    let currentLevel = null;
    if (level != null) {
        currentLevel = bestByLevel.find(x => x.level === level) || null;
    }

    return {
        generatedAt: new Date().toISOString(),
        input: inputAbs,
        config: {
            lands,
            plantSpeedPerSecNoFert: NO_FERT_PLANT_SPEED_PER_SEC,
            plantSpeedPerSecNormalFert: NORMAL_FERT_PLANT_SPEED_PER_SEC,
            plantSecondsNoFert,
            plantSecondsNormalFert,
            fertilizer: {
                mode: 'minus_one_phase',
            },
            rule: {
                expPerCycle: 'expHarvest',
            },
        },
        stats: {
            rawCount: rawSeeds.length,
            calculatedCount: rows.length,
            skippedCount: skipped,
            missingPhaseReduceCount,
        },
        topNoFert: topNo.map(r => ({
            seedId: r.seedId,
            name: r.name,
            requiredLevel: r.requiredLevel,
            expPerHour: Number(r.farmExpPerHourNoFert.toFixed(4)),
        })),
        topNormalFert: topFert.map(r => ({
            seedId: r.seedId,
            name: r.name,
            requiredLevel: r.requiredLevel,
            expPerHour: Number(r.farmExpPerHourNormalFert.toFixed(4)),
            gainPercent: Number(r.gainPercent.toFixed(4)),
        })),
        bestByLevel,
        currentLevel,
        rows,
    };
}

function getPlantingRecommendation(level, lands, opts = {}) {
    const safeLevel = Math.max(1, Math.floor(toNum(level, 1)));
    const payload = analyzeExpYield({
        input: opts.input || DEFAULT_INPUT,
        lands: lands == null ? 18 : lands,
        top: opts.top || 20,
        level: safeLevel,
    });

    const availableRows = payload.rows.filter(r => r.requiredLevel <= safeLevel);
    const bestNoFertRow = pickTop(availableRows, 'farmExpPerHourNoFert', 1)[0] || null;
    const bestNormalFertRow = pickTop(availableRows, 'farmExpPerHourNormalFert', 1)[0] || null;

    return {
        level: safeLevel,
        lands: payload.config.lands,
        input: payload.input,
        bestNoFert: bestNoFertRow ? {
            seedId: bestNoFertRow.seedId,
            name: bestNoFertRow.name,
            requiredLevel: bestNoFertRow.requiredLevel,
            expPerHour: Number(bestNoFertRow.farmExpPerHourNoFert.toFixed(4)),
        } : null,
        bestNormalFert: bestNormalFertRow ? {
            seedId: bestNormalFertRow.seedId,
            name: bestNormalFertRow.name,
            requiredLevel: bestNormalFertRow.requiredLevel,
            expPerHour: Number(bestNormalFertRow.farmExpPerHourNormalFert.toFixed(4)),
        } : null,
        candidatesNoFert: pickTop(availableRows, 'farmExpPerHourNoFert', opts.top || 20).map(r => ({
            seedId: r.seedId,
            name: r.name,
            requiredLevel: r.requiredLevel,
            expPerHour: Number(r.farmExpPerHourNoFert.toFixed(4)),
        })),
        candidatesNormalFert: pickTop(availableRows, 'farmExpPerHourNormalFert', opts.top || 20).map(r => ({
            seedId: r.seedId,
            name: r.name,
            requiredLevel: r.requiredLevel,
            expPerHour: Number(r.farmExpPerHourNormalFert.toFixed(4)),
            gainPercent: Number(r.gainPercent.toFixed(4)),
        })),
    };
}

function main() {
    const opts = parseArgs(process.argv.slice(2));
    const payload = analyzeExpYield(opts);
    const rows = payload.rows;
    const topNo = pickTop(rows, 'farmExpPerHourNoFert', opts.top);
    const topFert = pickTop(rows, 'farmExpPerHourNormalFert', opts.top);
    const currentLevel = payload.currentLevel;

    writeJson(path.resolve(opts.outJson), payload);
    writeCsv(path.resolve(opts.outCsv), rows);
    writeSummaryTxt(
        path.resolve(opts.outTxt),
        opts,
        {
            input: payload.input,
            plantSecondsNoFert: payload.config.plantSecondsNoFert,
            plantSecondsNormalFert: payload.config.plantSecondsNormalFert,
            missingPhaseReduceCount: payload.stats.missingPhaseReduceCount,
        },
        topNo,
        topFert,
        currentLevel
    );

    console.log(`[收益率] 计算完成，共 ${rows.length} 条（跳过 ${payload.stats.skippedCount} 条）`);
    console.log(`[收益率] JSON: ${path.resolve(opts.outJson)}`);
    console.log(`[收益率] CSV : ${path.resolve(opts.outCsv)}`);
    console.log(`[收益率] TXT : ${path.resolve(opts.outTxt)}`);
    if (currentLevel) {
        console.log(`[收益率] Lv${opts.level} 最优(不施肥): ${currentLevel.bestNoFert.name} ${currentLevel.bestNoFert.expPerHour} exp/h`);
        console.log(`[收益率] Lv${opts.level} 最优(普通肥): ${currentLevel.bestNormalFert.name} ${currentLevel.bestNormalFert.expPerHour} exp/h`);
    }
}

module.exports = {
    analyzeExpYield,
    getPlantingRecommendation,
    DEFAULT_INPUT,
};

if (require.main === module) {
    try {
        main();
    } catch (e) {
        console.error(`[收益率] 失败: ${e.message}`);
        process.exit(1);
    }
}
