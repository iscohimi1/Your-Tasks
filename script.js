document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const taskForm = document.getElementById('task-form');
    const taskInput = document.getElementById('task-input');
    const taskList = document.getElementById('task-list');
    const filterButtonsContainer = document.querySelector('.filter-buttons');
    const tagFilterContainer = document.getElementById('tag-filter-container');
    const clearCompletedBtn = document.getElementById('clear-completed-btn');
    const emptyState = document.getElementById('empty-state');
    const noResultsState = document.getElementById('no-results-state');
    const activeTaskCountElement = document.getElementById('active-task-count');
    const searchInput = document.getElementById('search-input');
    const sortSelect = document.getElementById('sort-select');
    const progressBar = document.getElementById('progress-bar');
    const progressText = document.getElementById('progress-text');
    const canvas = document.getElementById('background-canvas');
    const ctx = canvas?.getContext('2d'); // Use optional chaining

    // Modal Elements
    const confirmationModal = document.getElementById('confirmation-modal');
    const modalMessage = document.getElementById('modal-message');
    const modalConfirmBtn = document.getElementById('modal-confirm-btn');
    const modalCancelBtn = document.getElementById('modal-cancel-btn');
    const modalCloseBtn = document.getElementById('modal-close-btn');

    // --- State ---
    let tasks = [];
    let currentFilter = 'all';
    let currentSearchTerm = '';
    let currentSort = 'manual'; // Default to manual order
    let editingTaskId = null;
    let modalConfirmCallback = null;
    let elementToFocusOnClose = null; // For modal accessibility fix
    let searchDebounceTimer = null;
    let draggedItem = null; // For drag and drop

    // Background Animation State
    let particles = [];
    const particleCount = 50;
    let animationFrameId = null;

    // --- Background Canvas Animation ---
    function resizeCanvas() {
        if (!canvas) return;
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }

    class Particle {
         constructor() {
            this.x = Math.random() * canvas.width;
            this.y = Math.random() * canvas.height;
            this.size = Math.random() * 2.5 + 1;
            this.speedX = Math.random() * 0.8 - 0.4;
            this.speedY = Math.random() * 0.8 - 0.4;
            this.opacity = Math.random() * 0.4 + 0.1;
        }
        update() {
            this.x += this.speedX;
            this.y += this.speedY;
            if (this.x < -this.size) this.x = canvas.width + this.size;
            if (this.x > canvas.width + this.size) this.x = -this.size;
            if (this.y < -this.size) this.y = canvas.height + this.size;
            if (this.y > canvas.height + this.size) this.y = -this.size;
        }
        draw() {
            if (!ctx) return;
            ctx.fillStyle = `rgba(255, 255, 255, ${this.opacity})`;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    function initParticles() {
        if (!canvas || !ctx) return;
        particles = [];
        for (let i = 0; i < particleCount; i++) {
            particles.push(new Particle());
        }
    }

    function animateParticles() {
        if (!ctx || !canvas) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        particles.forEach(p => {
            p.update();
            p.draw();
        });
        animationFrameId = requestAnimationFrame(animateParticles);
    }

     function startAnimation() {
        if (!animationFrameId && canvas) {
            resizeCanvas();
            initParticles();
            animateParticles();
        }
    }
    function stopAnimation() {
         if (animationFrameId) {
             cancelAnimationFrame(animationFrameId);
             animationFrameId = null;
             ctx?.clearRect(0, 0, canvas?.width || 0, canvas?.height || 0); // Clear if stopped
         }
    }

    // Handle reduced motion preference
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    function handleMotionChange() {
         if (motionQuery.matches) {
            stopAnimation();
        } else {
            startAnimation();
        }
    }
    handleMotionChange(); // Initial check
    motionQuery.addEventListener('change', handleMotionChange);

    if (canvas) {
       window.addEventListener('resize', () => {
            if (!motionQuery.matches) {
                resizeCanvas();
                initParticles(); // Re-initialize particles on resize for better distribution
            }
        });
    }

    // --- Helper Functions ---
    function debounce(func, delay) {
        let timeoutId;
        return function(...args) {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
                func.apply(this, args);
            }, delay);
        };
    }

     function formatDateForInput(dateString) {
        if (!dateString) return '';
        try {
            const date = new Date(dateString);
            // Ensure the date is treated as local when creating the string
             const year = date.getFullYear();
             const month = String(date.getMonth() + 1).padStart(2, '0');
             const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        } catch (e) { console.error("Date input formatting error:", e); return ''; }
    }

    function formatDateForDisplay(dateString) {
        if (!dateString) return null;
        try {
            // Parse YYYY-MM-DD as local date
            const date = new Date(dateString + 'T00:00:00'); // Treat as local start of day
            return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        } catch (e) { console.error("Date display formatting error:", e); return null; }
    }

    function isDateOverdue(dateString) {
        if (!dateString) return false;
        try {
             const today = new Date();
             today.setHours(0, 0, 0, 0); // Set today to the beginning of the day
             const dueDate = new Date(dateString + 'T00:00:00'); // Treat due date as local start of day
             return dueDate < today;
        } catch (e) { console.error("Date overdue check error:", e); return false; }
    }


    // --- Core Functions ---
    function loadTasks() {
        const storedTasks = localStorage.getItem('tasks');
        tasks = storedTasks ? JSON.parse(storedTasks) : [];
        tasks.forEach(task => {
            task.isEditing = false; // Runtime state, not saved
            task.isImportant = task.isImportant || false;
            task.tags = task.tags || [];
            task.notes = task.notes || '';
            task.createdAt = task.createdAt || parseInt(task.id);
            task.subtasks = task.subtasks || []; // Initialize subtasks
            task.subtasks.forEach(sub => sub.id = sub.id || Date.now().toString() + Math.random()); // Ensure subtask IDs
        });
        renderApp();
    }

    function saveTasks() {
        // Don't save the 'isEditing' state
        const tasksToSave = tasks.map(({ isEditing, ...rest }) => ({
            ...rest,
            // Ensure subtasks don't have isEditing either if we add it later
            subtasks: rest.subtasks?.map(({ isEditing: subEditing, ...subRest }) => subRest)
        }));
        localStorage.setItem('tasks', JSON.stringify(tasksToSave));
        renderApp(); // Re-render after saving
    }

    // --- Rendering ---
    function renderApp() {
        const filteredAndSortedTasks = getFilteredAndSortedTasks();
        renderTaskList(filteredAndSortedTasks);
        updateAppStats(); // Update stats based on the *total* tasks
        renderTagFilters();
        updateFilterButtons();
    }

    function getFilteredAndSortedTasks() {
        let processedTasks = [...tasks];

        // Apply Search Filter First
        if (currentSearchTerm) {
            const lowerSearchTerm = currentSearchTerm.toLowerCase();
            processedTasks = processedTasks.filter(task =>
                task.text.toLowerCase().includes(lowerSearchTerm) ||
                task.notes.toLowerCase().includes(lowerSearchTerm) ||
                task.tags.some(tag => tag.toLowerCase().includes(lowerSearchTerm)) ||
                task.subtasks.some(sub => sub.text.toLowerCase().includes(lowerSearchTerm)) // Search subtasks too
            );
        }

        // Apply Active Filter Button
        processedTasks = processedTasks.filter(task => {
            if (currentFilter === 'active') return !task.completed;
            if (currentFilter === 'completed') return task.completed;
            if (currentFilter === 'important') return task.isImportant && !task.completed; // Only show non-completed important
            if (currentFilter.startsWith('tag:')) {
                const tag = currentFilter.substring(4);
                return task.tags.map(t => t.toLowerCase()).includes(tag.toLowerCase());
            }
            return true; // 'all'
        });

        // Apply Sorting (only if not 'manual')
        if (currentSort !== 'manual') {
            processedTasks.sort((a, b) => {
                // Completed tasks generally go last unless explicitly sorted otherwise
                if (a.completed !== b.completed) {
                    return a.completed ? 1 : -1; // Non-completed first
                }

                // Actual sorting logic for non-completed or all
                switch (currentSort) {
                    case 'creation-asc': return a.createdAt - b.createdAt;
                    case 'due-date':
                        const dateA = a.dueDate ? new Date(a.dueDate + 'T00:00:00') : null;
                        const dateB = b.dueDate ? new Date(b.dueDate + 'T00:00:00') : null;
                        if (!dateA && !dateB) return a.createdAt - b.createdAt; // Fallback sort
                        if (!dateA) return 1; // Tasks without due date later
                        if (!dateB) return -1; // Tasks without due date later
                        if (dateA < dateB) return -1;
                        if (dateA > dateB) return 1;
                        return a.createdAt - b.createdAt; // Secondary sort by creation if dates equal
                    case 'priority':
                        // Sort by priority (important first), then by creation date (newest first)
                        if (a.isImportant !== b.isImportant) return a.isImportant ? -1 : 1;
                        return b.createdAt - a.createdAt;
                    case 'alphabetical':
                         return a.text.localeCompare(b.text);
                    case 'creation-desc':
                    default: return b.createdAt - a.createdAt;
                }
            });
        }
        // If sort is 'manual', we rely on the order in the original `tasks` array filtered down

        return processedTasks;
    }


    function renderTaskList(tasksToRender) {
        taskList.innerHTML = ''; // Clear previous list

        const showEmpty = tasks.length === 0;
        const showNoResults = tasks.length > 0 && tasksToRender.length === 0;

        emptyState.style.display = showEmpty ? 'block' : 'none';
        emptyState.classList.toggle('show', showEmpty);
        noResultsState.style.display = showNoResults ? 'block' : 'none';
        noResultsState.classList.toggle('show', showNoResults);


        if (!showEmpty && !showNoResults) {
             tasksToRender.forEach(task => {
                const li = createTaskElement(task);
                taskList.appendChild(li);
                 // Staggered fade-in animation (optional, can be complex with sorting/filtering)
                 requestAnimationFrame(() => {
                     requestAnimationFrame(() => {
                         li.classList.remove('task-entering');
                     });
                 });
            });
        }
    }

    function updateAppStats() {
        const totalTasks = tasks.length;
        // Consider subtasks in progress calculation? Simple approach: count main tasks only.
        const completedTasksCount = tasks.filter(task => task.completed).length;
        const activeTasksCount = totalTasks - completedTasksCount;

        activeTaskCountElement.textContent = activeTasksCount;
        updateClearButtonState(completedTasksCount > 0);

        // Progress based on main tasks
        const progress = totalTasks === 0 ? 0 : Math.round((completedTasksCount / totalTasks) * 100);
        progressBar.style.width = `${progress}%`;
        progressText.textContent = `${progress}% Complete`;
    }

     function renderTagFilters() {
        const allTags = [...new Set(tasks.flatMap(task => task.tags))].sort((a, b) => a.localeCompare(b));
        tagFilterContainer.innerHTML = ''; // Clear existing tags

        allTags.forEach(tag => {
            const button = document.createElement('button');
            button.className = 'filter-btn tag-filter';
            button.dataset.filter = `tag:${tag}`;
            button.innerHTML = `<i class="fas fa-tag fa-xs"></i> ${tag}`;
            button.title = `Filter by: ${tag}`;
            // Event listener handled by delegation on .filter-buttons container
            tagFilterContainer.appendChild(button);
        });
         updateFilterButtons(); // Update active state after rendering tags
    }


    // --- Task Element Creation (Includes Subtasks) ---
    function createTaskElement(task) {
        const li = document.createElement('li');
        li.dataset.id = task.id;
        li.className = `task-item ${task.completed ? 'completed' : ''} ${task.isEditing ? 'editing' : ''} ${task.isImportant && !task.completed ? 'important' : ''} task-entering`;
        li.draggable = !task.isEditing; // Make draggable only when not editing

        // Task Wrapper (for easier structure)
        const taskWrapper = document.createElement('div');
        taskWrapper.className = 'task-wrapper';

        // Drag Handle (Optional - makes dragging more explicit)
        const dragHandle = document.createElement('span');
        dragHandle.className = 'drag-handle';
        dragHandle.innerHTML = '<i class="fas fa-grip-vertical"></i>';
        dragHandle.style.display = task.completed ? 'none' : ''; // Hide on completed
        // Prevent handle click from toggling completion
        dragHandle.addEventListener('click', e => e.stopPropagation());


        // Task Content (Display + Edit)
        const taskContent = document.createElement('div');
        taskContent.className = 'task-content';

        // --- Display Area ---
        const taskDisplay = document.createElement('div');
        taskDisplay.className = 'task-display';

        const taskMainLine = document.createElement('div');
        taskMainLine.className = 'task-main-line';

        const taskText = document.createElement('span');
        taskText.className = 'task-text';
        taskText.textContent = task.text;
        taskText.addEventListener('dblclick', (e) => { e.stopPropagation(); !task.completed && enterEditMode(task.id); });
        taskText.addEventListener('click', (e) => { e.stopPropagation(); !task.isEditing && toggleTaskCompletion(task.id); });

        taskMainLine.appendChild(taskText);
        taskDisplay.appendChild(taskMainLine);

        // Task Meta (Date, Tags)
        const taskMeta = document.createElement('div');
        taskMeta.className = 'task-meta';
        const formattedDate = formatDateForDisplay(task.dueDate);
        if (formattedDate) {
            const dueDateSpan = document.createElement('span');
            dueDateSpan.className = 'due-date';
            dueDateSpan.innerHTML = `<i class="far fa-calendar-alt"></i> ${formattedDate}`;
            if (!task.completed && isDateOverdue(task.dueDate)) {
                dueDateSpan.classList.add('overdue');
                dueDateSpan.title = 'Overdue!';
                dueDateSpan.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${formattedDate}`;
            }
            taskMeta.appendChild(dueDateSpan);
        }
        if (task.tags.length > 0) {
            const tagsContainer = document.createElement('div');
            tagsContainer.className = 'tags-container';
            task.tags.forEach(tag => {
                const tagSpan = document.createElement('span');
                tagSpan.className = 'tag-item';
                tagSpan.textContent = tag;
                tagSpan.title = `Filter by tag: ${tag}`;
                tagSpan.addEventListener('click', (e) => {
                     e.stopPropagation(); // Prevent li click
                     changeFilter(`tag:${tag}`);
                });
                tagsContainer.appendChild(tagSpan);
            });
             taskMeta.appendChild(tagsContainer);
        }
         if (taskMeta.children.length > 0) { // Only append meta if it has content
             taskDisplay.appendChild(taskMeta);
         }

        // --- Edit Controls Area ---
        const editControls = document.createElement('div');
        editControls.className = 'edit-controls';
        editControls.addEventListener('click', e => e.stopPropagation()); // Prevent clicks inside edit closing it

        const editInput = document.createElement('input');
        editInput.type = 'text'; editInput.className = 'edit-input'; editInput.value = task.text; editInput.required = true;
        editInput.addEventListener('keypress', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveTaskEdit(task.id); } });
        const dateInput = document.createElement('input');
        dateInput.type = 'date'; dateInput.className = 'date-input'; dateInput.value = formatDateForInput(task.dueDate);
        const tagsInput = document.createElement('input');
        tagsInput.type = 'text'; tagsInput.className = 'tags-input'; tagsInput.value = task.tags.join(', ');
        tagsInput.placeholder = 'Tags (comma-separated)';
        const notesInput = document.createElement('textarea');
        notesInput.className = 'notes-input'; notesInput.value = task.notes; notesInput.placeholder = 'Add notes...';
        const editPriorityToggle = document.createElement('div');
        editPriorityToggle.className = `edit-priority-toggle ${task.isImportant ? 'active' : ''}`;
        editPriorityToggle.innerHTML = `<i class="fas fa-star"></i> Mark as important`;
        editPriorityToggle.title = "Toggle Importance";
        editPriorityToggle.addEventListener('click', () => {
            editPriorityToggle.classList.toggle('active');
        });
        editControls.appendChild(editInput);
        editControls.appendChild(dateInput);
        editControls.appendChild(tagsInput);
        editControls.appendChild(notesInput);
        editControls.appendChild(editPriorityToggle);

        taskContent.appendChild(taskDisplay);
        taskContent.appendChild(editControls);

        // --- Subtasks Area ---
        const subtaskList = document.createElement('ul');
        subtaskList.className = 'subtask-list';
        task.subtasks.forEach(subtask => {
            const subLi = createSubtaskElement(task.id, subtask);
            subtaskList.appendChild(subLi);
        });

        // Add Subtask Input (only visible in edit mode)
        const addSubtaskWrapper = document.createElement('div');
        addSubtaskWrapper.className = 'add-subtask-wrapper';
        const addSubtaskInput = document.createElement('input');
        addSubtaskInput.type = 'text';
        addSubtaskInput.placeholder = '+ Add subtask';
        addSubtaskInput.className = 'add-subtask-input';
        addSubtaskInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && addSubtaskInput.value.trim()) {
                e.preventDefault();
                addSubtask(task.id, addSubtaskInput.value.trim());
                addSubtaskInput.value = ''; // Clear input after adding
            }
        });
        addSubtaskWrapper.appendChild(addSubtaskInput);


        // --- Action Buttons ---
        const taskActions = document.createElement('div');
        taskActions.className = 'task-actions';

        const priorityBtn = document.createElement('button');
        priorityBtn.className = `action-btn priority-toggle-btn ${task.isImportant ? 'important' : ''}`;
        priorityBtn.innerHTML = `<i class="fas fa-star"></i>`;
        priorityBtn.setAttribute('aria-label', task.isImportant ? 'Remove priority' : 'Mark as important');
        priorityBtn.title = task.isImportant ? 'Remove priority' : 'Mark as important';
        priorityBtn.style.display = task.completed || task.isEditing ? 'none' : '';
        priorityBtn.addEventListener('click', (e) => { e.stopPropagation(); togglePriority(task.id); });

        const completeBtn = document.createElement('button');
        completeBtn.className = 'action-btn complete-btn';
        completeBtn.innerHTML = `<i class="fas ${task.completed ? 'fa-undo' : 'fa-check'}"></i>`;
        completeBtn.setAttribute('aria-label', task.completed ? 'Mark as active' : 'Mark as complete');
        completeBtn.title = task.completed ? 'Mark as active' : 'Mark as complete';
        completeBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleTaskCompletion(task.id); });

        const editSaveBtn = document.createElement('button');
        editSaveBtn.className = `action-btn ${task.isEditing ? 'save-btn' : 'edit-btn'}`;
        editSaveBtn.innerHTML = `<i class="fas ${task.isEditing ? 'fa-save' : 'fa-pencil-alt'}"></i>`;
        editSaveBtn.setAttribute('aria-label', task.isEditing ? 'Save changes' : 'Edit task');
        editSaveBtn.title = task.isEditing ? 'Save changes' : 'Edit task';
        editSaveBtn.style.display = task.completed ? 'none' : '';
        editSaveBtn.addEventListener('click', (e) => { e.stopPropagation(); task.isEditing ? saveTaskEdit(task.id) : enterEditMode(task.id); });

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'action-btn delete-btn';
        deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
        deleteBtn.setAttribute('aria-label', 'Delete task');
        deleteBtn.title = 'Delete task';
        deleteBtn.addEventListener('click', (e) => { e.stopPropagation(); confirmDeleteTask(task.id); });

        taskActions.appendChild(priorityBtn);
        taskActions.appendChild(completeBtn);
        taskActions.appendChild(editSaveBtn);
        taskActions.appendChild(deleteBtn);

        // Assemble the task item
        taskWrapper.appendChild(dragHandle);
        taskWrapper.appendChild(taskContent);
        taskWrapper.appendChild(taskActions);

        li.appendChild(taskWrapper);
        // Append subtasks and add-subtask input outside the main wrapper, but inside the li
        if (task.subtasks.length > 0 || task.isEditing) {
             li.appendChild(subtaskList);
        }
        if (task.isEditing) {
            li.appendChild(addSubtaskWrapper);
            requestAnimationFrame(() => editInput.select()); // Focus main input when editing starts
        }


        return li;
    }

     // --- Subtask Element Creation ---
     function createSubtaskElement(parentId, subtask) {
        const subLi = document.createElement('li');
        subLi.dataset.id = subtask.id;
        subLi.dataset.parentId = parentId;
        subLi.className = `subtask-item ${subtask.completed ? 'completed' : ''}`;

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = subtask.completed;
        checkbox.className = 'subtask-checkbox';
        checkbox.addEventListener('change', () => toggleSubtaskCompletion(parentId, subtask.id));

        const subText = document.createElement('span');
        subText.className = 'subtask-text';
        subText.textContent = subtask.text;
        subText.addEventListener('click', () => toggleSubtaskCompletion(parentId, subtask.id)); // Click text also toggles

        const deleteSubBtn = document.createElement('button');
        deleteSubBtn.className = 'action-btn delete-subtask-btn';
        deleteSubBtn.innerHTML = '<i class="fas fa-times"></i>';
        deleteSubBtn.title = 'Delete subtask';
        deleteSubBtn.setAttribute('aria-label', 'Delete subtask');
        deleteSubBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            confirmDeleteSubtask(parentId, subtask.id, subtask.text);
        });

        subLi.appendChild(checkbox);
        subLi.appendChild(subText);
        subLi.appendChild(deleteSubBtn);

        return subLi;
    }

    // --- Task Manipulation ---
     function addTask(event) {
        event.preventDefault();
        const rawText = taskInput.value.trim();
        if (!rawText) return;

        let text = rawText;
        let tags = [];
        let isImportant = false;

        // Basic parsing for #tag and !important
        const words = text.split(' ');
        text = words.filter(word => !word.startsWith('#') && word !== '!important').join(' ');
        tags = words.filter(word => word.startsWith('#') && word.length > 1)
                     .map(tag => tag.substring(1).toLowerCase().replace(/[^a-z0-9_-]/g, '')) // Clean tags
                     .filter(tag => tag); // Remove empty tags after cleaning
        isImportant = words.includes('!important');

        if (!text) {
            // Maybe show a small validation message instead of alert
            taskInput.style.borderColor = 'var(--delete-color)';
            setTimeout(() => taskInput.style.borderColor = '', 1500);
             console.warn("Task text cannot be empty after parsing.");
             return;
        }

        const newTask = {
            id: Date.now().toString(),
            createdAt: Date.now(),
            text: text,
            completed: false,
            dueDate: null,
            isImportant: isImportant,
            tags: [...new Set(tags)], // Ensure unique tags
            notes: '',
            isEditing: false, // Runtime state
            subtasks: [] // Initialize subtasks array
        };

        tasks.unshift(newTask); // Add to the beginning for default "Newest First" feel
        taskInput.value = ''; // Clear input

        // If currently viewing completed, switch to 'all' to see the new task
        if (currentFilter === 'completed') {
            changeFilter('all'); // This will trigger saveTasks via renderApp
        } else {
            saveTasks(); // Save and re-render
        }
        taskInput.focus(); // Keep focus on input
    }

    function toggleTaskCompletion(id) {
        if (editingTaskId === id) return; // Don't toggle while editing
        const taskIndex = tasks.findIndex(task => task.id === id);
        if (taskIndex > -1) {
            tasks[taskIndex].completed = !tasks[taskIndex].completed;
            // Optionally mark all subtasks as completed/active too? Decide on behavior.
            // For now, subtasks completion is independent.
            saveTasks();
        }
    }

     function togglePriority(id) {
         if (editingTaskId === id) return;
         const taskIndex = tasks.findIndex(task => task.id === id);
         if (taskIndex > -1 && !tasks[taskIndex].completed) { // Can only prioritize active tasks
             tasks[taskIndex].isImportant = !tasks[taskIndex].isImportant;
             saveTasks();
         }
     }

    function enterEditMode(id) {
        // Save any previously edited task first
        if (editingTaskId && editingTaskId !== id) {
            saveTaskEdit(editingTaskId, false); // Save without triggering full render yet
        }
        const taskIndex = tasks.findIndex(task => task.id === id);
        if (taskIndex > -1 && !tasks[taskIndex].completed) { // Can only edit active tasks
            tasks.forEach((task, index) => {
                task.isEditing = (task.id === id);
            });
            editingTaskId = id;
            renderTaskList(getFilteredAndSortedTasks()); // Re-render just the list to show edit fields
             // Update draggable state for all items
            updateDraggability();
        }
    }

     function saveTaskEdit(id, triggerRender = true) {
        const taskIndex = tasks.findIndex(task => task.id === id);
        if (taskIndex === -1) {
            console.error("Task not found for saving:", id);
             editingTaskId = null; // Reset editing state
             if (triggerRender) renderApp(); // Render to reflect reset state
            return;
        }

        // Find the corresponding list item IF it's currently rendered
        const li = taskList.querySelector(`li.task-item[data-id="${id}"]`);
        let newText, newDueDate, newTags = [], newNotes, newImportance;

        if (li && tasks[taskIndex].isEditing) {
            // Get values from the input fields within the specific li
            const editInput = li.querySelector('.edit-input');
            const dateInput = li.querySelector('.date-input');
            const tagsInput = li.querySelector('.tags-input');
            const notesInput = li.querySelector('.notes-input');
            const editPriorityToggle = li.querySelector('.edit-priority-toggle');

            newText = editInput.value.trim();
            newDueDate = dateInput.value || null; // Store as YYYY-MM-DD or null
            newTags = tagsInput.value.split(',')
                             .map(tag => tag.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '')) // Clean tags
                             .filter(tag => tag.length > 0);
            newNotes = notesInput.value.trim();
            newImportance = editPriorityToggle.classList.contains('active');

        } else if (tasks[taskIndex].isEditing) {
             // Task was being edited, but its element isn't currently rendered (e.g., due to filtering)
             // We can't get new values from inputs. Just exit edit mode without saving changes.
             console.warn(`Task ${id} was being edited but not rendered. Exiting edit mode without saving changes from inputs.`);
             tasks[taskIndex].isEditing = false;
             editingTaskId = null;
             if (triggerRender) renderApp(); // Re-render to show task in display mode
             updateDraggability();
             return; // Exit function here
        } else {
             // Task was not in editing state, nothing to save
             editingTaskId = null; // Ensure reset
             if (triggerRender) renderApp();
             updateDraggability();
             return;
        }


        if (newText) {
            tasks[taskIndex].text = newText;
            tasks[taskIndex].dueDate = newDueDate;
            tasks[taskIndex].tags = [...new Set(newTags)]; // Ensure unique tags
            tasks[taskIndex].notes = newNotes;
            tasks[taskIndex].isImportant = newImportance;
            tasks[taskIndex].isEditing = false; // Exit editing state
            editingTaskId = null; // Reset global editing ID
             if (triggerRender) saveTasks(); // Save and trigger full re-render
             else {
                 // If not triggering a full render, we still need to update draggability
                 updateDraggability();
             }
        } else {
            // If text becomes empty, cancel edit without saving
            console.warn("Task text cannot be empty. Edit cancelled.");
            tasks[taskIndex].isEditing = false;
            editingTaskId = null;
            if (triggerRender) renderApp(); // Re-render to show original state
            else updateDraggability();
        }
    }

    // --- Subtask Manipulation ---
    function addSubtask(parentId, text) {
        const parentTaskIndex = tasks.findIndex(task => task.id === parentId);
        if (parentTaskIndex > -1 && !tasks[parentTaskIndex].completed) {
            const newSubtask = {
                id: Date.now().toString() + Math.random(), // Simple unique ID
                text: text,
                completed: false
            };
            tasks[parentTaskIndex].subtasks.push(newSubtask);
            saveTasks(); // Save and re-render the whole app to show the new subtask
        }
    }

    function toggleSubtaskCompletion(parentId, subtaskId) {
         const parentTaskIndex = tasks.findIndex(task => task.id === parentId);
         if (parentTaskIndex > -1) {
             const subtaskIndex = tasks[parentTaskIndex].subtasks.findIndex(sub => sub.id === subtaskId);
             if (subtaskIndex > -1) {
                 tasks[parentTaskIndex].subtasks[subtaskIndex].completed = !tasks[parentTaskIndex].subtasks[subtaskIndex].completed;
                 saveTasks();
             }
         }
    }

    function confirmDeleteSubtask(parentId, subtaskId, subtaskText) {
         elementToFocusOnClose = document.activeElement; // Store focus
         const safeText = subtaskText.replace(/</g, "<").replace(/>/g, ">");
         showModal(`Delete subtask "${safeText}"?`, () => {
            deleteSubtask(parentId, subtaskId);
         });
    }

    function deleteSubtask(parentId, subtaskId) {
         const parentTaskIndex = tasks.findIndex(task => task.id === parentId);
         if (parentTaskIndex > -1) {
             tasks[parentTaskIndex].subtasks = tasks[parentTaskIndex].subtasks.filter(sub => sub.id !== subtaskId);
             saveTasks();
         }
         // Focus is restored in hideModal
    }


    // --- Deletion, Confirmation, Clearing ---
     function showModal(message, onConfirm) {
        modalMessage.textContent = message;
        modalConfirmCallback = onConfirm;

        // Store focus BEFORE showing modal
        elementToFocusOnClose = document.activeElement instanceof HTMLElement ? document.activeElement : null;

        confirmationModal.style.display = 'flex'; // Make it visible
         requestAnimationFrame(() => { // Allow display change to paint
            confirmationModal.setAttribute('aria-hidden', 'false');
            // Focus the cancel button by default for safety
             modalCancelBtn.focus();
         });
    }

    function hideModal() {
        confirmationModal.setAttribute('aria-hidden', 'true');
        confirmationModal.style.display = 'none'; // Hide immediately
        modalConfirmCallback = null;

        // Restore focus to the element that opened the modal
        if (elementToFocusOnClose) {
            try {
                 // Check if the element still exists and is focusable
                if (typeof elementToFocusOnClose.focus === 'function' && document.body.contains(elementToFocusOnClose)) {
                    elementToFocusOnClose.focus();
                } else {
                     taskInput?.focus(); // Fallback
                }
            } catch (e) {
                console.warn("Could not restore focus after modal close:", e);
                taskInput?.focus(); // Fallback
            }
            elementToFocusOnClose = null; // Clear stored element
        } else {
             taskInput?.focus(); // General fallback
        }
    }

    function confirmDeleteTask(id) {
        const taskToDelete = tasks.find(task => task.id === id);
        if (!taskToDelete) return;
        const safeText = taskToDelete.text.replace(/</g, "<").replace(/>/g, ">"); // Basic escaping

        // Store focus before showing modal
        elementToFocusOnClose = document.activeElement;

        showModal(`Delete task "${safeText}"? This cannot be undone.`, () => {
            deleteTask(id);
        });
    }

    function deleteTask(id) {
        const taskElement = taskList.querySelector(`li[data-id="${id}"]`);

        if (taskElement && !motionQuery.matches) { // Only animate if not reduced motion
            taskElement.classList.add('task-deleting');
            // Use transitionend for smoother removal matching CSS transition
            taskElement.addEventListener('transitionend', () => {
                tasks = tasks.filter(task => task.id !== id);
                saveTasks(); // Save remaining tasks and re-render
            }, { once: true });
             // Fallback timeout in case transitionend doesn't fire
             setTimeout(() => {
                 if (tasks.find(t => t.id === id)) { // Check if still exists
                     console.warn("Fallback timeout removing deleted task:", id);
                     tasks = tasks.filter(task => task.id !== id);
                     saveTasks();
                 }
             }, 500); // Slightly longer than animation
        } else {
            // If element not found or reduced motion, remove immediately
            tasks = tasks.filter(task => task.id !== id);
            saveTasks(); // Save remaining tasks and re-render
        }
        // Focus is restored via hideModal
    }


    function confirmClearCompleted() {
        const completedCount = tasks.filter(task => task.completed).length;
        if (completedCount === 0) return;

        elementToFocusOnClose = document.activeElement; // Store focus

        showModal(`Clear all ${completedCount} completed task(s)?`, () => {
            clearCompletedTasks();
        });
    }

    function clearCompletedTasks() {
        const completedTasks = tasks.filter(task => task.completed);
        if (completedTasks.length === 0) return;

        if (!motionQuery.matches) { // Animate only if not reduced motion
            let animationPromises = [];
            completedTasks.forEach(task => {
                const taskElement = taskList.querySelector(`li[data-id="${task.id}"]`);
                if (taskElement) {
                     taskElement.classList.add('task-deleting');
                     animationPromises.push(
                        new Promise(resolve => {
                            // Use transitionend for consistency
                            taskElement.addEventListener('transitionend', resolve, { once: true });
                            // Fallback timeout
                            setTimeout(resolve, 500);
                        })
                     );
                 }
            });

            Promise.all(animationPromises).then(() => {
                tasks = tasks.filter(task => !task.completed);
                saveTasks(); // Save remaining tasks and trigger re-render
            }).catch(error => {
                 console.error("Error during clear completed animation:", error);
                 tasks = tasks.filter(task => !task.completed); // Fallback removal
                 saveTasks();
            });
        } else {
             // Reduced motion: remove immediately
             tasks = tasks.filter(task => !task.completed);
             saveTasks();
        }
         // Focus is restored via hideModal
    }

    // --- UI Updates ---
    function updateClearButtonState(hasCompleted) {
        clearCompletedBtn.disabled = !hasCompleted;
    }

    function updateFilterButtons() {
        document.querySelectorAll('.filter-btn').forEach(button => {
            button.classList.toggle('active', button.dataset.filter === currentFilter);
        });
    }

    function changeFilter(filterValue) {
        currentFilter = filterValue;
        renderApp(); // Re-render based on the new filter
    }

    // --- Drag and Drop ---
    function handleDragStart(e) {
        // Only allow dragging on the handle or the main task area, not buttons/inputs
         const handle = e.target.closest('.drag-handle');
         const content = e.target.closest('.task-content');
         const actions = e.target.closest('.task-actions');
         const editControls = e.target.closest('.edit-controls');
         const subtaskItem = e.target.closest('.subtask-item');

         if (editControls || actions || subtaskItem) {
             e.preventDefault(); // Don't drag if clicking actions/edit/subtasks
             return;
         }

        const taskItem = e.target.closest('.task-item');
        if (!taskItem || taskItem.classList.contains('editing') || taskItem.classList.contains('completed')) {
            e.preventDefault(); // Don't drag editing or completed tasks
            return;
        }

        draggedItem = taskItem;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', taskItem.dataset.id); // Required for FF
        // Add visual cue with a slight delay
        setTimeout(() => {
            draggedItem.classList.add('dragging');
        }, 0);
    }

    function handleDragOver(e) {
        e.preventDefault(); // Necessary to allow drop
        e.dataTransfer.dropEffect = 'move';
        const targetItem = e.target.closest('.task-item');
        const taskListElement = e.target.closest('#task-list');

        if (!taskListElement || !draggedItem) return; // Exit if not over the list or no item dragged

        // Clear previous indicators
        taskList.querySelectorAll('.drag-over-indicator-top, .drag-over-indicator-bottom').forEach(el => el.remove());

        if (targetItem && targetItem !== draggedItem && !targetItem.classList.contains('completed')) {
             // Determine if dragging above or below the target item
             const rect = targetItem.getBoundingClientRect();
             const halfway = rect.top + rect.height / 2;
             let indicatorClass;

             if (e.clientY < halfway) {
                 indicatorClass = 'drag-over-indicator-top';
             } else {
                  indicatorClass = 'drag-over-indicator-bottom';
             }
            // Add visual indicator line
             const indicator = document.createElement('div');
             indicator.className = indicatorClass;
             targetItem.appendChild(indicator);

        } else if (!targetItem) {
             // If hovering over empty space in the list (e.g., at the bottom)
             // Maybe add indicator to the list itself? (Less common)
        }
    }

    function handleDragLeave(e) {
        // Remove indicators when leaving an item briefly
        const targetItem = e.target.closest('.task-item');
         if (targetItem) {
             targetItem.querySelectorAll('.drag-over-indicator-top, .drag-over-indicator-bottom').forEach(el => el.remove());
         }
    }


    function handleDrop(e) {
        e.preventDefault();
        if (!draggedItem) return;

        const targetItem = e.target.closest('.task-item');
        const draggedId = draggedItem.dataset.id;

        // Remove dragging class and indicators
        draggedItem.classList.remove('dragging');
         taskList.querySelectorAll('.drag-over-indicator-top, .drag-over-indicator-bottom').forEach(el => el.remove());

        let targetId = null;
        let insertBefore = true; // Default to inserting before target

        if (targetItem && targetItem !== draggedItem && !targetItem.classList.contains('completed')) {
            targetId = targetItem.dataset.id;
             // Determine if dropping above or below based on mouse position
             const rect = targetItem.getBoundingClientRect();
             const halfway = rect.top + rect.height / 2;
             if (e.clientY >= halfway) {
                insertBefore = false; // Insert after the target
             }

        } else if (!targetItem) {
            // Dropped in empty space (likely end of list), append
             const lastVisibleTask = Array.from(taskList.querySelectorAll('.task-item:not(.dragging):not(.completed)')).pop();
             if (lastVisibleTask) {
                 targetId = lastVisibleTask.dataset.id;
                 insertBefore = false; // Insert after the last item
             } else {
                 // List was empty or only contained the dragged item/completed items
                 targetId = null; // Will prepend or append based on implementation
                 insertBefore = true; // Default to prepend if list becomes empty
             }
        } else {
             // Dropped on itself or a completed item, do nothing
             draggedItem = null;
             return;
        }


        // Find indices in the main `tasks` array
        const draggedIndex = tasks.findIndex(task => task.id === draggedId);
        let targetIndex = tasks.findIndex(task => task.id === targetId);

        if (draggedIndex === -1) {
            console.error("Dragged task not found in array!");
            draggedItem = null;
            return;
        }

        // Remove the dragged task from its original position
        const [movedTask] = tasks.splice(draggedIndex, 1);

        // Calculate new index
        if (targetId === null) {
            // If dropped in empty space or list only had completed items
            if (insertBefore) {
                tasks.unshift(movedTask); // Add to beginning
            } else {
                tasks.push(movedTask); // Add to end
            }
        } else {
             // Find the new target index *after* removing the dragged item
            targetIndex = tasks.findIndex(task => task.id === targetId);
            if (targetIndex === -1) { // Target might have been the removed item itself? Should not happen with checks.
                 console.error("Target task disappeared unexpectedly");
                 tasks.splice(draggedIndex, 0, movedTask); // Put it back roughly where it was
            } else {
                if (insertBefore) {
                    tasks.splice(targetIndex, 0, movedTask);
                } else {
                    tasks.splice(targetIndex + 1, 0, movedTask);
                }
            }
        }


        // Set sort order to manual and save
        currentSort = 'manual';
        sortSelect.value = 'manual';
        saveTasks(); // This will re-render the list in the new order

        draggedItem = null; // Reset dragged item
    }

    function handleDragEnd(e) {
        // Clean up in case drop didn't happen properly
        if (draggedItem) {
            draggedItem.classList.remove('dragging');
        }
        taskList.querySelectorAll('.drag-over-indicator-top, .drag-over-indicator-bottom').forEach(el => el.remove());
        draggedItem = null;
    }

    // Helper to update draggable attribute on all items
    function updateDraggability() {
        taskList.querySelectorAll('.task-item').forEach(item => {
             const task = tasks.find(t => t.id === item.dataset.id);
             item.draggable = task && !task.isEditing && !task.completed;
             // Also update handle visibility
             const handle = item.querySelector('.drag-handle');
             if (handle) {
                 handle.style.display = (task && !task.isEditing && !task.completed) ? '' : 'none';
             }
        });
    }

    // --- Event Listeners ---
    taskForm.addEventListener('submit', addTask);

    // Debounced Search Listener
    searchInput.addEventListener('input', debounce((e) => {
        currentSearchTerm = e.target.value;
        renderApp();
    }, 300)); // 300ms delay

    sortSelect.addEventListener('change', (e) => {
        currentSort = e.target.value;
        renderApp();
    });

    // Event Delegation for filter buttons (including tags)
     filterButtonsContainer.addEventListener('click', (event) => {
         const targetButton = event.target.closest('.filter-btn');
         if (targetButton && targetButton.dataset.filter) {
             changeFilter(targetButton.dataset.filter);
         }
     });

    clearCompletedBtn.addEventListener('click', confirmClearCompleted);

    // Modal Listeners
    modalConfirmBtn.addEventListener('click', () => {
        if (modalConfirmCallback) {
            modalConfirmCallback(); // Execute the stored confirm action
        }
        hideModal(); // Hide modal AFTER action is initiated
    });
    modalCancelBtn.addEventListener('click', hideModal);
    modalCloseBtn.addEventListener('click', hideModal);
    confirmationModal.addEventListener('click', (event) => {
        // Close if clicking on the overlay itself
        if (event.target === confirmationModal) {
            hideModal();
        }
    });

    // Keyboard listener for Esc key (close modal or cancel edit)
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            if (confirmationModal.getAttribute('aria-hidden') === 'false') {
                hideModal();
            } else if (editingTaskId) {
                 // Find the task and simply cancel editing without saving
                 const taskIndex = tasks.findIndex(t => t.id === editingTaskId);
                 if (taskIndex > -1) {
                     tasks[taskIndex].isEditing = false;
                     const oldEditingId = editingTaskId;
                     editingTaskId = null;
                     // Re-render only if the item is currently visible
                     const li = taskList.querySelector(`li.task-item[data-id="${oldEditingId}"]`);
                     if (li) {
                         renderTaskList(getFilteredAndSortedTasks()); // Refresh list to show display mode
                     } else {
                         // If not visible, just update state, full render not strictly needed
                         updateDraggability();
                     }
                 }
             }
        }
    });

    // Drag and Drop Listeners (delegated to the list)
    taskList.addEventListener('dragstart', handleDragStart);
    taskList.addEventListener('dragover', handleDragOver);
    taskList.addEventListener('dragleave', handleDragLeave);
    taskList.addEventListener('drop', handleDrop);
    taskList.addEventListener('dragend', handleDragEnd); // Clean up listener

    // --- Initial Load ---
    loadTasks(); // Load tasks from localStorage and render the app
});