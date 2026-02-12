// ========== 常量 ==========
const NO_FERT_PLANTS_PER_2_SEC = 18;
const NORMAL_FERT_PLANTS_PER_2_SEC = 12;
const NO_FERT_PLANT_SPEED = NO_FERT_PLANTS_PER_2_SEC / 2; // 9
const NORMAL_FERT_PLANT_SPEED = NORMAL_FERT_PLANTS_PER_2_SEC / 2; // 6

// ========== 数据 ==========
let seedData = [];
let plantPhaseMap = {};
let seedImageMap = {};
let seedNameImageMap = {};
let calculatedRows = [];
let currentRankTab = 'noFert';

// 作物 emoji 映射
const cropEmojis = {
    '白萝卜': '🥕', '胡萝卜': '🥕', '大白菜': '🥬', '大蒜': '🧄', '大葱': '🧅',
    '水稻': '🌾', '小麦': '🌾', '玉米': '🌽', '鲜姜': '🫚', '土豆': '🥔',
    '小白菜': '🥬', '生菜': '🥬', '油菜': '🌿', '茄子': '🍆', '红枣': '🫘',
    '蒲公英': '🌼', '银莲花': '🌸', '番茄': '🍅', '花菜': '🥦', '韭菜': '🌿',
    '小雏菊': '🌼', '豌豆': '🫛', '莲藕': '🪷', '红玫瑰': '🌹', '秋菊（黄色）': '🌻',
    '满天星': '💫', '含羞草': '🌿', '牵牛花': '🌺', '秋菊（红色）': '🌺', '辣椒': '🌶️',
    '黄瓜': '🥒', '芹菜': '🌿', '天香百合': '🌷', '南瓜': '🎃', '核桃': '🌰',
    '山楂': '🍒', '菠菜': '🥬', '草莓': '🍓', '苹果': '🍎', '四叶草': '🍀',
    '非洲菊': '🌼', '火绒草': '🌿', '花香根鸢尾': '💐', '虞美人': '🌺', '向日葵': '🌻',
    '西瓜': '🍉', '黄豆': '🫘', '香蕉': '🍌', '竹笋': '🎋', '桃子': '🍑',
    '甘蔗': '🎋', '橙子': '🍊', '茉莉花': '🌸', '葡萄': '🍇', '丝瓜': '🥒',
    '榛子': '🌰', '迎春花': '🌼', '石榴': '🍎', '栗子': '🌰', '柚子': '🍊',
    '蘑菇': '🍄', '菠萝': '🍍', '箬竹': '🎋', '无花果': '🫒', '椰子': '🥥',
    '花生': '🥜', '金针菇': '🍄', '葫芦': '🫑', '猕猴桃': '🥝', '梨': '🍐',
    '睡莲': '🪷', '火龙果': '🐉', '枇杷': '🍑', '樱桃': '🍒', '李子': '🫐',
    '荔枝': '🍒', '香瓜': '🍈', '木瓜': '🥭', '桂圆': '🫐', '月柿': '🍊',
    '杨桃': '⭐', '哈密瓜': '🍈', '桑葚': '🫐', '柠檬': '🍋', '芒果': '🥭',
    '杨梅': '🫐', '榴莲': '🥭', '番石榴': '🍈', '瓶子树': '🌳', '蓝莓': '🫐',
    '猪笼草': '🌿', '山竹': '🍑', '曼陀罗华': '🌸', '曼珠沙华': '🌺', '苦瓜': '🥒',
    '天堂鸟': '🦜', '冬瓜': '🥒', '豹皮花': '🌺', '杏子': '🍑', '金桔': '🍊',
};

function getCropEmoji(name) {
    return cropEmojis[name] || '🌱';
}

function getCropImage(seedId, name, size = 32) {
    const fileName = seedImageMap[seedId] || seedNameImageMap[name];
    if (fileName) {
        return `<img src="seed_images_named/${fileName}" alt="${name}" class="crop-img" loading="lazy" style="width:${size}px;height:${size}px;">`;
    }
    return `<span style="font-size:${size * 0.75}px;">${getCropEmoji(name)}</span>`;
}

// ========== 初始化 ==========
async function init() {
    try {
        const [seedRes, plantRes, mappingRes] = await Promise.all([
            fetch('seed-shop-merged-export.json'),
            fetch('Plant.json'),
            fetch('seed_mapping.json'),
        ]);
        const seedJson = await seedRes.json();
        const plantJson = await plantRes.json();
        const mappingJson = await mappingRes.json();

        // 构建 seedId -> 图片文件名 映射 + name -> 图片文件名 映射
        seedImageMap = {};
        seedNameImageMap = {};
        for (const m of mappingJson) {
            const sid = Number(m.seedId);
            if (sid > 0 && m.fileName) {
                seedImageMap[sid] = m.fileName;
            }
            if (m.name && m.fileName && m.name !== '未知') {
                seedNameImageMap[m.name] = m.fileName;
            }
        }

        seedData = Array.isArray(seedJson) ? seedJson : (seedJson.rows || seedJson.seeds || []);

        // 构建 plant phase reduce map
        plantPhaseMap = {};
        for (const p of plantJson) {
            const seedId = Number(p.seed_id) || 0;
            if (seedId <= 0 || plantPhaseMap[seedId]) continue;
            const phases = parseGrowPhases(p.grow_phases);
            if (phases.length > 0) {
                plantPhaseMap[seedId] = phases[0];
            }
        }

        // 初始计算
        // calculate();
        renderCatalog();
    } catch (e) {
        console.error('初始化失败:', e);
    }
}

function parseGrowPhases(growPhases) {
    if (!growPhases || typeof growPhases !== 'string') return [];
    return growPhases
        .split(';')
        .map(x => x.trim())
        .filter(Boolean)
        .map(seg => {
            const parts = seg.split(':');
            return parts.length >= 2 ? (Number(parts[1]) || 0) : 0;
        })
        .filter(sec => sec > 0);
}

function formatSec(sec) {
    const s = Math.max(0, Math.round(sec));
    if (s < 60) return `${s}秒`;
    const m = Math.floor(s / 60);
    const r = s % 60;
    if (m < 60) return r > 0 ? `${m}分${r}秒` : `${m}分钟`;
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return mm > 0 ? `${h}小时${mm}分` : `${h}小时`;
}

// ========== 核心计算 ==========
function buildRows(lands, level, useFert) {
    const plantSecNoFert = lands / NO_FERT_PLANT_SPEED;
    const plantSecFert = lands / NORMAL_FERT_PLANT_SPEED;
    const rows = [];

    for (const s of seedData) {
        const seedId = Number(s.seedId || s.seed_id) || 0;
        const name = s.name || `seed_${seedId}`;
        const requiredLevel = Number(s.requiredLevel || s.required_level || 1) || 1;
        const price = Number(s.price) || 0;
        const exp = Number(s.exp) || 0;
        const growTimeSec = Number(s.growTimeSec || s.growTime || s.grow_time || 0) || 0;
        const seasons = Number(s.seasons) || 1;

        if (seedId <= 0 || growTimeSec <= 0) continue;
        if (level && requiredLevel > level) continue;

        const reduceSec = plantPhaseMap[seedId] || 0;
        const growTimeFert = Math.max(1, growTimeSec - reduceSec);

        const cycleNoFert = growTimeSec + plantSecNoFert;
        const cycleFert = growTimeFert + plantSecFert;

        const expPerHourNoFert = (lands * exp / cycleNoFert) * 3600;
        const expPerHourFert = (lands * exp / cycleFert) * 3600;
        const gainPercent = expPerHourNoFert > 0
            ? ((expPerHourFert - expPerHourNoFert) / expPerHourNoFert) * 100
            : 0;

        rows.push({
            seedId,
            name,
            requiredLevel,
            price,
            exp,
            growTimeSec,
            growTimeStr: s.growTimeStr || formatSec(growTimeSec),
            seasons,
            reduceSec,
            growTimeFert,
            growTimeFertStr: formatSec(growTimeFert),
            cycleNoFert,
            cycleFert,
            expPerHourNoFert,
            expPerHourFert,
            expPerDayNoFert: expPerHourNoFert * 24,
            expPerDayFert: expPerHourFert * 24,
            gainPercent,
        });
    }

    return rows;
}

// ========== 计算入口 ==========
function calculate() {
    const level = Math.max(1, Math.min(100, parseInt(document.getElementById('inputLevel').value) || 27));
    const lands = Math.max(1, parseInt(document.getElementById('inputLands').value) || 18);
    const useFert = document.getElementById('skillFertilizer').checked;

    calculatedRows = buildRows(lands, level, useFert);

    // 隐藏引导占位
    const placeholder = document.getElementById('cardPlaceholder');
    if (placeholder) placeholder.style.display = 'none';

    if (calculatedRows.length === 0) return;

    // 排序
    const sortedNoFert = [...calculatedRows].sort((a, b) => b.expPerHourNoFert - a.expPerHourNoFert);
    const sortedFert = [...calculatedRows].sort((a, b) => b.expPerHourFert - a.expPerHourFert);

    const bestNo = sortedNoFert[0];
    const bestFert = sortedFert[0];

    // 渲染不施肥推荐
    const cardNoFert = document.getElementById('cardNoFert');
    cardNoFert.style.display = '';
    cardNoFert.classList.add('fade-in');
    document.getElementById('noFertName').innerHTML = `${getCropImage(bestNo.seedId, bestNo.name, 36)} ${bestNo.name}`;
    document.getElementById('noFertExpH').textContent = bestNo.expPerHourNoFert.toFixed(2);
    document.getElementById('noFertExpD').textContent = Math.round(bestNo.expPerDayNoFert).toLocaleString();
    document.getElementById('noFertGrow').textContent = bestNo.growTimeStr;
    document.getElementById('noFertLv').textContent = `Lv ${bestNo.requiredLevel}`;

    // 渲染施肥推荐
    if (useFert) {
        const cardFert = document.getElementById('cardFert');
        cardFert.style.display = '';
        cardFert.classList.add('fade-in');
        document.getElementById('fertName').innerHTML = `${getCropImage(bestFert.seedId, bestFert.name, 36)} ${bestFert.name}`;
        document.getElementById('fertExpH').textContent = bestFert.expPerHourFert.toFixed(2);
        document.getElementById('fertExpD').textContent = Math.round(bestFert.expPerDayFert).toLocaleString();
        document.getElementById('fertGrow').textContent = bestFert.growTimeFertStr;
        document.getElementById('fertGain').textContent = `+${bestFert.gainPercent.toFixed(2)}%`;
    } else {
        document.getElementById('cardFert').style.display = 'none';
    }

    // 渲染进度条对比（Top 5）
    renderProgressBars(sortedNoFert, sortedFert, useFert);

    // 渲染排行榜
    renderRanking();

    // 提示计算完成
    const fertText = useFert ? '开启' : '关闭';
    const plantSecNo = (lands / NO_FERT_PLANT_SPEED).toFixed(1);
    const plantSecFert = (lands / NORMAL_FERT_PLANT_SPEED).toFixed(1);
    let msg = `📋 计算条件：Lv${level} · ${lands}块地 · 肥料${fertText}\n`;
    msg += `⏱️ 种植速度：不施肥 ${NO_FERT_PLANTS_PER_2_SEC}块/2秒，施肥 ${NORMAL_FERT_PLANTS_PER_2_SEC}块/2秒\n`;
    msg += `🏡 整场种完：不施肥 ${plantSecNo}秒，施肥 ${plantSecFert}秒\n`;
    msg += `🧪 肥料效果：减少一个生长阶段\n`;
    msg += `📊 共分析 ${calculatedRows.length} 种可用作物\n`;
    msg += `🌾 不施肥最优：${getCropEmoji(bestNo.name)} ${bestNo.name}（${bestNo.expPerHourNoFert.toFixed(2)} exp/h）`;
    if (useFert) {
        msg += `\n🧪 施肥最优：${getCropEmoji(bestFert.name)} ${bestFert.name}（${bestFert.expPerHourFert.toFixed(2)} exp/h · ↑${bestFert.gainPercent.toFixed(1)}%）`;
    }
    showToast(msg);
}

// ========== 进度条 ==========
function renderProgressBars(sortedNoFert, sortedFert, useFert) {
    const container = document.getElementById('progressBars');
    const card = document.getElementById('cardProgress');
    card.style.display = '';
    card.classList.add('fade-in');

    const colors = ['fill-green', 'fill-orange', 'fill-purple', 'fill-blue', 'fill-pink'];
    const top5 = useFert ? sortedFert.slice(0, 5) : sortedNoFert.slice(0, 5);
    const maxExp = top5[0] ? (useFert ? top5[0].expPerHourFert : top5[0].expPerHourNoFert) : 1;

    let html = '';
    top5.forEach((r, i) => {
        const exp = useFert ? r.expPerHourFert : r.expPerHourNoFert;
        const pct = (exp / maxExp * 100).toFixed(1);
        html += `
        <div class="progress-row">
            <span class="progress-label">${getCropImage(r.seedId, r.name, 24)} ${r.name}</span>
            <div class="progress-track">
                <div class="progress-fill ${colors[i]}" style="width: ${pct}%">${pct}%</div>
            </div>
            <span class="progress-value">${exp.toFixed(2)} /h</span>
        </div>`;
    });
    container.innerHTML = html;
}

// ========== 排行榜 ==========
function switchRankTab(tab, btn) {
    currentRankTab = tab;
    document.querySelectorAll('.clay-tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    renderRanking();
}

function renderRanking() {
    const body = document.getElementById('rankingBody');
    const isFert = currentRankTab === 'fert';
    const key = isFert ? 'expPerHourFert' : 'expPerHourNoFert';
    const sorted = [...calculatedRows].sort((a, b) => b[key] - a[key]).slice(0, 20);
    const maxExp = sorted[0] ? sorted[0][key] : 1;

    let html = '';
    sorted.forEach((r, i) => {
        const rank = i + 1;
        const rankClass = rank <= 3 ? `rank-${rank}` : '';
        const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank;
        const exp = r[key];
        const pct = (exp / maxExp * 100).toFixed(1);
        const growStr = isFert ? r.growTimeFertStr : r.growTimeStr;

        html += `
        <div class="ranking-row">
            <span class="rank-num ${rankClass}">${medal}</span>
            <span class="rank-name">${getCropImage(r.seedId, r.name, 24)} ${r.name}</span>
            <span class="rank-level">Lv${r.requiredLevel}</span>
            <span class="rank-grow">${growStr}</span>
            <span class="rank-exp">${exp.toFixed(2)}</span>
            <div class="rank-bar-wrap"><div class="rank-bar-fill" style="width:${pct}%"></div></div>
        </div>`;
    });
    body.innerHTML = html;
}

// ========== 作物图鉴 ==========
function renderCatalog() {
    const grid = document.getElementById('catalogGrid');
    const search = (document.getElementById('catalogSearch').value || '').trim().toLowerCase();
    const seasonFilter = document.getElementById('catalogSeason').value;

    let items = seedData.filter(s => {
        const name = (s.name || '').toLowerCase();
        if (search && !name.includes(search)) return false;
        if (seasonFilter !== 'all' && String(s.seasons) !== seasonFilter) return false;
        return true;
    });

    let html = '';
    items.forEach(s => {
        const name = s.name || '';
        const emoji = getCropEmoji(name);
        const seasons = Number(s.seasons) || 1;
        const seasonText = seasons === 1 ? '一季' : '二季';

        const seedId = Number(s.seedId) || 0;
        html += `
        <div class="catalog-item">
            <div class="catalog-emoji">${getCropImage(seedId, name, 48)}</div>
            <div class="catalog-name">${name}</div>
            <div class="catalog-meta">
                <span class="catalog-tag">Lv ${s.requiredLevel}</span>
                <span class="catalog-tag tag-season">${seasonText}</span>
                <span class="catalog-tag tag-price">💰 ${s.price}</span>
            </div>
            <div class="catalog-detail">
                <strong>经验:</strong> ${s.exp} &nbsp;
                <strong>生长:</strong> ${s.growTimeStr || formatSec(s.growTimeSec)}<br>
                <strong>产量:</strong> ${s.fruitCount || '-'}
            </div>
        </div>`;
    });

    grid.innerHTML = html || '<p style="text-align:center;color:#a08d7d;grid-column:1/-1;">没有找到匹配的作物</p>';
}

function filterCatalog() {
    renderCatalog();
}

// ========== Toast 提示框 ==========
function showToast(message) {
    // 移除已有的 toast
    const old = document.querySelector('.clay-toast-overlay');
    if (old) old.remove();

    const overlay = document.createElement('div');
    overlay.className = 'clay-toast-overlay';

    const toast = document.createElement('div');
    toast.className = 'clay-toast';

    const icon = document.createElement('div');
    icon.className = 'toast-icon';
    icon.textContent = '🎉';

    const title = document.createElement('div');
    title.className = 'toast-title';
    title.textContent = '计算完成';

    const msg = document.createElement('div');
    msg.className = 'toast-message';
    msg.innerHTML = message.replace(/\n/g, '<br>');

    const btn = document.createElement('button');
    btn.className = 'toast-btn';
    btn.textContent = '🌟 太棒了！';
    btn.onclick = () => {
        toast.classList.add('toast-out');
        overlay.classList.add('overlay-out');
        setTimeout(() => overlay.remove(), 300);
    };

    toast.appendChild(icon);
    toast.appendChild(title);
    toast.appendChild(msg);
    toast.appendChild(btn);
    overlay.appendChild(toast);
    document.body.appendChild(overlay);

    // 点击遮罩关闭
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            toast.classList.add('toast-out');
            overlay.classList.add('overlay-out');
            setTimeout(() => overlay.remove(), 300);
        }
    });
}

// ========== 启动 ==========
document.addEventListener('DOMContentLoaded', init);
