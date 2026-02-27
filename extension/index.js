const fs = require('fs').promises;
const path = require('path');
const os = require('os');

class PlannerExtension {
  constructor() {
    this.dataDir = path.join(os.homedir(), '.pi', 'planner-data');
    this.tasksFile = path.join(this.dataDir, 'tasks.json');
    this.projectsFile = path.join(this.dataDir, 'projects.json');
  }

  async initialize() {
    // Ensure data directory exists
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create planner data directory:', error);
    }
  }

  async loadTasks() {
    try {
      const data = await fs.readFile(this.tasksFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      return [];
    }
  }

  async saveTasks(tasks) {
    await fs.writeFile(this.tasksFile, JSON.stringify(tasks, null, 2));
  }

  async loadProjects() {
    try {
      const data = await fs.readFile(this.projectsFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      return [];
    }
  }

  async saveProjects(projects) {
    await fs.writeFile(this.projectsFile, JSON.stringify(projects, null, 2));
  }

  async createPlan(description) {
    const plan = {
      id: Date.now().toString(),
      description,
      created: new Date().toISOString(),
      steps: [],
      status: 'pending'
    };

    return {
      success: true,
      message: 'Plan created successfully',
      plan
    };
  }

  async addTask(title, options = {}) {
    const tasks = await this.loadTasks();
    
    const task = {
      id: Date.now().toString(),
      title,
      description: options.description || '',
      priority: options.priority || 'medium',
      status: 'pending',
      created: new Date().toISOString(),
      projectId: options.projectId || null
    };

    tasks.push(task);
    await this.saveTasks(tasks);

    return {
      success: true,
      message: 'Task added successfully',
      task
    };
  }

  async listTasks(filter = {}) {
    const tasks = await this.loadTasks();
    
    let filtered = tasks;
    if (filter.status) {
      filtered = filtered.filter(t => t.status === filter.status);
    }
    if (filter.projectId) {
      filtered = filtered.filter(t => t.projectId === filter.projectId);
    }

    return {
      success: true,
      tasks: filtered
    };
  }

  async completeTask(taskId) {
    const tasks = await this.loadTasks();
    const task = tasks.find(t => t.id === taskId);

    if (!task) {
      return {
        success: false,
        message: 'Task not found'
      };
    }

    task.status = 'completed';
    task.completed = new Date().toISOString();
    await this.saveTasks(tasks);

    return {
      success: true,
      message: 'Task completed',
      task
    };
  }

  async deleteTask(taskId) {
    const tasks = await this.loadTasks();
    const filtered = tasks.filter(t => t.id !== taskId);

    if (filtered.length === tasks.length) {
      return {
        success: false,
        message: 'Task not found'
      };
    }

    await this.saveTasks(filtered);

    return {
      success: true,
      message: 'Task deleted'
    };
  }

  async createProject(name, options = {}) {
    const projects = await this.loadProjects();

    const project = {
      id: Date.now().toString(),
      name,
      description: options.description || '',
      created: new Date().toISOString(),
      status: 'active',
      milestones: []
    };

    projects.push(project);
    await this.saveProjects(projects);

    return {
      success: true,
      message: 'Project created successfully',
      project
    };
  }

  async listProjects() {
    const projects = await this.loadProjects();

    return {
      success: true,
      projects
    };
  }
}

// Export the extension
module.exports = PlannerExtension;
