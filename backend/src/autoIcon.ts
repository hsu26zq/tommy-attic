// Every page's icon is picked automatically from what the page is about (title + all its text).
// No topic clearly wins → a simple mark for what the page holds (a database, a drawing, a PDF) → otherwise no icon.
// English, Traditional/Simplified Chinese and Japanese words all count. Single characters that show up
// inside many other words (本, 家, 画…) are left out so they can't tip the result.

type Topic = { icon: string; words: string[] };

const TOPICS: Topic[] = [
  { icon: "🇯🇵", words: ["japanese", "japan", "kanji", "hiragana", "katakana", "jlpt", "n1", "n2", "n3", "n4", "n5", "日本語", "日文", "日語", "文法", "助詞", "敬語", "漢字", "ひらがな", "カタカナ", "です", "ます"] },
  { icon: "🇨🇳", words: ["chinese", "mandarin", "pinyin", "hsk", "中文", "華語", "汉语", "漢語", "拼音", "注音", "成語"] },
  { icon: "🔤", words: ["english", "vocabulary", "vocab", "grammar", "toefl", "ielts", "英文", "英語", "單字", "单词", "単語", "語彙"] },
  { icon: "🍳", words: ["recipe", "recipes", "cook", "cooking", "ingredient", "ingredients", "bake", "baking", "oven", "tbsp", "tsp", "食譜", "食谱", "料理", "做法", "材料", "烹飪", "レシピ", "調味"] },
  { icon: "☕", words: ["coffee", "espresso", "latte", "tea", "咖啡", "茶", "コーヒー", "お茶"] },
  { icon: "📚", words: ["book", "books", "reading", "novel", "author", "chapter", "isbn", "讀書", "读书", "小說", "小说", "読書", "作者"] },
  { icon: "🎬", words: ["movie", "movies", "film", "films", "series", "episode", "netflix", "anime", "電影", "电影", "影集", "劇", "映画", "アニメ", "ドラマ"] },
  { icon: "🎵", words: ["music", "song", "songs", "album", "playlist", "guitar", "piano", "chord", "lyrics", "音樂", "音乐", "歌", "專輯", "音楽", "曲", "ギター"] },
  { icon: "🎮", words: ["game", "games", "gaming", "steam", "nintendo", "playstation", "xbox", "遊戲", "游戏", "ゲーム"] },
  { icon: "✈️", words: ["travel", "trip", "flight", "hotel", "itinerary", "airport", "visa", "passport", "旅行", "旅遊", "旅游", "行程", "機票", "飯店", "ホテル", "観光"] },
  { icon: "💪", words: ["workout", "gym", "exercise", "fitness", "run", "running", "squat", "bench", "reps", "健身", "運動", "运动", "跑步", "筋トレ", "トレーニング"] },
  { icon: "🩺", words: ["health", "doctor", "medicine", "symptom", "hospital", "clinic", "健康", "醫生", "医生", "看病", "病院", "医者"] },
  { icon: "💰", words: ["money", "budget", "expense", "expenses", "income", "invest", "investing", "stock", "stocks", "salary", "tax", "finance", "預算", "预算", "記帳", "记账", "投資", "投资", "股票", "薪水", "お金", "家計簿", "株"] },
  { icon: "💼", words: ["work", "job", "career", "resume", "interview", "meeting", "meetings", "client", "manager", "工作", "面試", "面试", "履歷", "會議", "会议", "仕事", "面接", "会議"] },
  { icon: "🗓️", words: ["schedule", "calendar", "plan", "planner", "weekly", "monthly", "agenda", "deadline", "計畫", "计划", "行事曆", "日程", "予定", "スケジュール"] },
  { icon: "✅", words: ["todo", "to-do", "tasks", "task", "checklist", "done", "待辦", "待办", "清單", "清单", "タスク", "やること"] },
  { icon: "💡", words: ["idea", "ideas", "brainstorm", "inspiration", "想法", "點子", "点子", "靈感", "灵感", "アイデア"] },
  { icon: "📓", words: ["journal", "diary", "today", "dear diary", "日記", "日记", "心情", "日誌"] },
  { icon: "💻", words: ["code", "coding", "programming", "javascript", "typescript", "python", "react", "api", "function", "bug", "git", "github", "server", "database", "sql", "linux", "程式", "程序", "代碼", "代码", "プログラミング", "コード"] },
  { icon: "🤖", words: ["ai", "llm", "claude", "chatgpt", "gpt", "machine learning", "neural", "prompt", "人工智慧", "人工智能", "機器學習"] },
  { icon: "🧮", words: ["math", "maths", "calculus", "algebra", "equation", "theorem", "proof", "matrix", "數學", "数学", "微積分", "方程"] },
  { icon: "🔬", words: ["science", "physics", "chemistry", "biology", "experiment", "lab", "物理", "化學", "化学", "生物", "實驗", "实验", "科学"] },
  { icon: "🎓", words: ["school", "class", "lecture", "exam", "homework", "university", "course", "study", "studying", "學校", "学校", "考試", "考试", "作業", "作业", "大學", "上課", "授業", "試験", "宿題", "勉強"] },
  { icon: "🏠", words: ["home", "house", "apartment", "rent", "furniture", "moving", "房子", "租屋", "搬家", "家具", "引っ越し"] },
  { icon: "🛒", words: ["shopping", "buy", "groceries", "grocery", "wishlist", "order", "購物", "购物", "清單", "買い物"] },
  { icon: "🌱", words: ["plant", "plants", "garden", "gardening", "seed", "water", "植物", "花園", "園芸"] },
  { icon: "🐾", words: ["dog", "cat", "pet", "pets", "puppy", "kitten", "vet", "狗", "貓", "猫", "寵物", "宠物", "犬", "ペット"] },
  { icon: "🎨", words: ["design", "drawing", "art", "sketch", "color", "palette", "figma", "illustration", "設計", "设计", "藝術", "デザイン", "イラスト"] },
  { icon: "📷", words: ["photo", "photos", "photography", "camera", "lens", "攝影", "摄影", "相機", "照片", "写真", "カメラ"] },
  { icon: "⚽", words: ["football", "soccer", "basketball", "baseball", "tennis", "nba", "match", "足球", "籃球", "篮球", "棒球", "サッカー", "野球"] },
  { icon: "🎁", words: ["gift", "gifts", "birthday", "present", "christmas", "禮物", "礼物", "生日", "プレゼント", "誕生日"] },
  { icon: "❤️", words: ["love", "relationship", "date", "wedding", "愛", "爱", "戀愛", "恋爱", "結婚", "恋愛"] },
  { icon: "🧠", words: ["learn", "learning", "notes", "summary", "concept", "memorize", "筆記", "笔记", "學習", "学习", "ノート", "まとめ"] },
];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const isCJK = (s: string) => /[぀-ヿ㐀-鿿]/.test(s);

function count(text: string, word: string): number {
  // CJK has no spaces, so match anywhere; English needs whole words
  const re = isCJK(word) ? new RegExp(escape(word), "g") : new RegExp(`(^|[^a-z0-9])${escape(word)}(?=[^a-z0-9]|$)`, "g");
  return Math.min(5, (text.match(re) ?? []).length); // one word repeated can't decide on its own
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function blockTypes(content: unknown, out: string[] = []): string[] {
  if (!Array.isArray(content)) return out;
  for (const b of content as { type?: string; children?: unknown }[]) {
    if (b?.type) out.push(b.type);
    if (b?.children) blockTypes(b.children, out);
  }
  return out;
}

export function autoIcon(title: string, markdown: string, content: unknown): string | null {
  const t = (title ?? "").toLowerCase();
  const body = (markdown ?? "").toLowerCase().slice(0, 40_000);
  const scores = TOPICS.map((topic) => ({
    icon: topic.icon,
    score: topic.words.reduce((s, w) => s + count(t, w) * 3 + count(body, w), 0),
  })).sort((a, b) => b.score - a.score);
  const [best, next] = scores;
  if (best.score >= 3 && best.score >= (next?.score ?? 0) * 1.5) return best.icon;

  // No clear topic: pick by what the page holds. Only a completely empty page gets no icon.
  const types = blockTypes(content);
  const has = (x: string) => types.filter((y) => y === x).length;
  const text = types.filter((x) => !["database", "drawing", "pdf", "embed", "table"].includes(x)).length;
  if (has("database") && has("database") * 3 >= text) return "📊";
  if (has("drawing") && has("drawing") * 3 >= text) return "✏️";
  if (has("pdf") && has("pdf") * 3 >= text) return "📄";
  if (has("table") && has("table") * 3 >= text) return "📋";
  if (best.score > 0 && best.score > (next?.score ?? 0)) return best.icon; // a weak topic still beats a generic mark
  if (has("checkListItem") * 2 >= text && has("checkListItem")) return "✅";
  if (has("codeBlock") * 2 >= text && has("codeBlock")) return "💻";
  const hasWords = /[\p{L}\p{N}]/u.test(body) || (t && t !== "untitled");
  if (hasWords || types.some((x) => ["drawing", "pdf", "embed", "table"].includes(x))) return "📝";
  return null;
}
