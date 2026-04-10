import { Router, type Request, type Response } from 'express'
import db from '../db.js'

const router = Router()

// GET /home
router.get('/home', (req: Request, res: Response) => {
  try {
    const sections = db.prepare('SELECT section_key, content_json FROM homepage_content').all() as { section_key: string; content_json: string }[]
    const data: Record<string, any> = {}
    for (const section of sections) {
      try {
        data[section.section_key] = JSON.parse(section.content_json)
      } catch (e) {
        data[section.section_key] = section.content_json
      }
    }
    res.json({ success: true, data })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
})

// PUT /home
router.put('/home', (req: Request, res: Response) => {
  try {
    const body = req.body
    if (!body || typeof body !== 'object') {
       res.status(400).json({ success: false, message: 'Invalid data format' })
       return
    }

    const transaction = db.transaction((updates: Record<string, any>) => {
      const stmt = db.prepare('INSERT INTO homepage_content (section_key, content_json) VALUES (?, ?) ON CONFLICT(section_key) DO UPDATE SET content_json = excluded.content_json')
      for (const [key, value] of Object.entries(updates)) {
        const contentJson = typeof value === 'string' ? value : JSON.stringify(value)
        stmt.run(key, contentJson)
      }
    })

    transaction(body)
    res.json({ success: true, message: 'Home content updated successfully' })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
})

// GET /articles
router.get('/articles', (req: Request, res: Response) => {
  try {
    const { category, is_published, limit = 10, offset = 0 } = req.query
    let query = 'SELECT id, title, summary, cover_image, category, is_published, view_count, created_at, updated_at FROM articles WHERE 1=1'
    const params: any[] = []

    if (category) {
      query += ' AND category = ?'
      params.push(category)
    }
    
    if (is_published !== undefined) {
      query += ' AND is_published = ?'
      params.push(is_published === 'true' || is_published === '1' ? 1 : 0)
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?'
    params.push(Number(limit), Number(offset))

    const articles = db.prepare(query).all(...params)
    
    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM articles WHERE 1=1'
    const countParams: any[] = []
    if (category) {
      countQuery += ' AND category = ?'
      countParams.push(category)
    }
    if (is_published !== undefined) {
      countQuery += ' AND is_published = ?'
      countParams.push(is_published === 'true' || is_published === '1' ? 1 : 0)
    }
    const { total } = db.prepare(countQuery).get(...countParams) as { total: number }

    res.json({ success: true, articles, total })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
})

// GET /articles/:id
router.get('/articles/:id', (req: Request, res: Response) => {
  try {
    const id = req.params.id
    const article = db.prepare('SELECT * FROM articles WHERE id = ?').get(id)
    
    if (!article) {
      res.status(404).json({ success: false, message: 'Article not found' })
      return
    }

    // Update view count
    db.prepare('UPDATE articles SET view_count = view_count + 1 WHERE id = ?').run(id)
    
    res.json({ success: true, article })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
})

// POST /articles
router.post('/articles', (req: Request, res: Response) => {
  try {
    const { title, summary, content, cover_image, category, is_published = 0 } = req.body

    if (!title || !content) {
      res.status(400).json({ success: false, message: 'Title and content are required' })
      return
    }

    const info = db.prepare(`
      INSERT INTO articles (title, summary, content, cover_image, category, is_published)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(title, summary || null, content, cover_image || null, category || null, is_published ? 1 : 0)

    res.json({ success: true, message: 'Article created successfully', id: info.lastInsertRowid })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
})

// PUT /articles/:id
router.put('/articles/:id', (req: Request, res: Response) => {
  try {
    const id = req.params.id
    const { title, summary, content, cover_image, category, is_published } = req.body

    const existing = db.prepare('SELECT id FROM articles WHERE id = ?').get(id)
    if (!existing) {
      res.status(404).json({ success: false, message: 'Article not found' })
      return
    }

    const updates: string[] = []
    const params: any[] = []

    if (title !== undefined) {
      updates.push('title = ?')
      params.push(title)
    }
    if (summary !== undefined) {
      updates.push('summary = ?')
      params.push(summary)
    }
    if (content !== undefined) {
      updates.push('content = ?')
      params.push(content)
    }
    if (cover_image !== undefined) {
      updates.push('cover_image = ?')
      params.push(cover_image)
    }
    if (category !== undefined) {
      updates.push('category = ?')
      params.push(category)
    }
    if (is_published !== undefined) {
      updates.push('is_published = ?')
      params.push(is_published ? 1 : 0)
    }

    if (updates.length === 0) {
      res.json({ success: true, message: 'No fields to update' })
      return
    }

    updates.push('updated_at = CURRENT_TIMESTAMP')
    params.push(id)

    db.prepare(`UPDATE articles SET ${updates.join(', ')} WHERE id = ?`).run(...params)

    res.json({ success: true, message: 'Article updated successfully' })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
})

// DELETE /articles/:id
router.delete('/articles/:id', (req: Request, res: Response) => {
  try {
    const id = req.params.id
    const info = db.prepare('DELETE FROM articles WHERE id = ?').run(id)
    
    if (info.changes === 0) {
      res.status(404).json({ success: false, message: 'Article not found' })
      return
    }

    res.json({ success: true, message: 'Article deleted successfully' })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
})

// POST /contact
router.post('/contact', (req: Request, res: Response) => {
  try {
    const { name, email, message } = req.body

    if (!name || !message) {
      res.status(400).json({ success: false, message: '姓名和留言内容为必填项' })
      return
    }

    const info = db.prepare(`
      INSERT INTO contact_messages (name, email, message)
      VALUES (?, ?, ?)
    `).run(name, email || null, message)

    res.json({ success: true, message: '留言提交成功', id: info.lastInsertRowid })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
})

export default router
