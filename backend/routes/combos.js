const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env

const DINING_FILES = {
  alley:          'alley_dining_menus.json',
  c4c:            'c4c_dining_menus.json',
  libby:          'libby_dining_menus.json',
  sewall:         'sewall_dining_menus.json',
  village_center: 'village_center_dining_menus.json',
};

const DATA_DIR = path.join(__dirname, '../../scraping_scripts/data');

/**
 * GET /api/combos/generate?dining=alley&date=2026-03-16
 *
 * Query params:
 *   dining  - one of: alley, c4c, libby, sewall, village_center (required)
 *   date    - YYYY-MM-DD (optional, defaults to today)
 */
router.get('/generate', async (req, res) => {
  const { dining, date } = req.query;

  if (!dining || !DINING_FILES[dining]) {
    return res.status(400).json({
      error: `Invalid dining location. Must be one of: ${Object.keys(DINING_FILES).join(', ')}`,
    });
  }

  const targetDate = date || new Date().toISOString().split('T')[0];

  // Load menu JSON
  const filePath = path.join(DATA_DIR, DINING_FILES[dining]);
  let menuData;
  try {
    menuData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return res.status(500).json({ error: 'Failed to load menu data' });
  }

  // Find the day's menu
  const dayMenu = menuData.menus.find(m => m.date === targetDate);
  if (!dayMenu) {
    return res.status(404).json({
      error: `No menu found for ${menuData.dining_location} on ${targetDate}`,
    });
  }

  // Build a compact item list to keep the prompt focused
  const allItems = [];
  for (const [category, items] of Object.entries(dayMenu.categories)) {
    for (const item of items) {
      allItems.push({
        name: item.name,
        category,
        calories: item.calories,
        protein_g: item.nutrition?.protein_g,
        is_vegan: item.is_vegan,
        is_vegetarian: item.is_vegetarian,
        allergens: item.allergens,
        dietary_labels: item.dietary_labels,
      });
    }
  }

  if (allItems.length === 0) {
    return res.status(404).json({ error: 'No menu items found for this date' });
  }

  const prompt = `You are a creative dining combo suggester for CU Boulder's ${menuData.dining_location} dining hall.

Here are today's available menu items (${dayMenu.day_of_week}, ${targetDate}):
${JSON.stringify(allItems, null, 2)}

Generate 4 creative, well-balanced meal combos from these items. Each combo should:
- Have a fun, catchy name
- Include 2-4 items from different categories when possible
- Provide an approximate total calorie count
- Include a short description explaining why it works (taste, nutrition, balance, etc.)
- List relevant tags like "high-protein", "vegan", "low-carb", etc.

Respond with ONLY a JSON array in this exact format, no extra text:
[
  {
    "title": "Combo Name",
    "dishes": ["Item 1", "Item 2"],
    "description": "Why this combo is great",
    "approximate_calories": 800,
    "tags": ["high-protein", "vegan"]
  }
]`;

  try {
    const stream = client.messages.stream({
      model: 'claude-haiku-4-5',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const finalMessage = await stream.finalMessage();
    const rawText = finalMessage.content.find(b => b.type === 'text')?.text ?? '';

    let combos;
    try {
      // Strip markdown code fences if Claude wraps in ```json
      const cleaned = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
      combos = JSON.parse(cleaned);
    } catch {
      return res.status(500).json({ error: 'Failed to parse AI response', raw: rawText });
    }

    const response = {
      dining_location: menuData.dining_location,
      date: targetDate,
      day_of_week: dayMenu.day_of_week,
      combos,
    };

    console.log('\n=== Combos Response ===');
    console.log(JSON.stringify(response, null, 2));
    console.log('======================\n');

    res.json(response);
  } catch (err) {
    res.status(500).json({ error: 'Claude API error', details: err.message });
  }
});

module.exports = router;
