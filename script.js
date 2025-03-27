document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const body = document.body;
    const taskForm = document.getElementById('task-form');
    const taskInput = document.getElementById('task-input');
    const inputError = document.getElementById('input-error');
    const taskList = document.getElementById('task-list');
    const filterButtonsContainer = document.querySelector('.filter-buttons');
    const tagFilterContainer = document.getElementById('tag-filter-container');
    const archiveCompletedBtn = document.getElementById('archive-completed-btn'); // Renamed from clearCompletedBtn
    const emptyState = document.getElementById('empty-state');
    const noResultsState = document.getElementById('no-results-state');
    const activeTaskCountElement = document.getElementById('active-task-count');
    const searchInput = document.getElementById('search-input');
    const sortSelect = document.getElementById('sort-select');
    const progressBar = document.getElementById('progress-bar');
    const progressText = document.getElementById('progress-text');
    const canvas = document.getElementById('background-canvas');
    const ctx = canvas?.getContext('2d');
    const themeToggleBtn = document.getElementById('theme-toggle-btn');
    const themeToggleIcon = themeToggleBtn.querySelector('i');

    // Modal Elements
    const confirmationModal = document.getElementById('confirmation-modal');
    const modalMessage = document.getElementById('modal-message');
    const modalConfirmBtn = document.getElementById('modal-confirm-btn');
    const modalCancelBtn = document.getElementById('modal-cancel-btn');
    const modalCloseBtn = document.getElementById('modal-close-btn');

    // --- State ---
    let tasks = [];
    let currentFilter = 'all'; // 'all', 'active', 'completed', 'important', 'archived', 'tag:...'
    let currentSearchTerm = '';
    let currentSort = 'manual';
    let editingTaskId = null;
    let editingSubtaskId = null; // Track which subtask is being edited
    let modalConfirmCallback = null;
    let elementToFocusOnClose = null;
    let searchDebounceTimer = null;
    let draggedItem = null;

    // Background Animation State
    let particles = [];
    const particleCount = 50; // Adjust density if needed
    let animationFrameId = null;

    // Day.js setup - Ensure plugins are loaded from index.html
    dayjs.extend(dayjs_plugin_relativeTime);
    dayjs.extend(dayjs_plugin_customParseFormat);
    dayjs.extend(dayjs_plugin_isTomorrow);
    dayjs.extend(dayjs_plugin_isToday);
    dayjs.extend(dayjs_plugin_isoWeek);


    // --- Constants ---
    const LOCAL_STORAGE_TASKS_KEY = 'tasks';
    const LOCAL_STORAGE_THEME_KEY = 'themePreference';
    const DARK_MODE_CLASS = 'dark-mode';

    // --- Background Canvas Animation ---
    function resizeCanvas() {
        if (!canvas) return;
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }

    class Particle {
         constructor() {
            if (!canvas) return; // Prevent errors if canvas not found
            this.x = Math.random() * canvas.width;
            this.y = Math.random() * canvas.height;
            this.size = Math.random() * 2.5 + 1; // Size range
            this.speedX = Math.random() * 0.6 - 0.3; // Slower speed
            this.speedY = Math.random() * 0.6 - 0.3; // Slower speed
            this.opacity = Math.random() * 0.3 + 0.1; // Lower opacity
        }
        update() {
            if (!canvas) return;
            this.x += this.speedX;
            this.y += this.speedY;
            // Wrap particles around edges
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
        if (!canvas || !ctx || motionQuery.matches) return; // Don't init if reduced motion
        particles = [];
        for (let i = 0; i < particleCount; i++) {
            particles.push(new Particle());
        }
    }

    function animateParticles() {
        if (!ctx || !canvas || motionQuery.matches) return; // Don't animate if reduced motion
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        particles.forEach(p => {
            p.update();
            p.draw();
        });
        animationFrameId = requestAnimationFrame(animateParticles);
    }

     function startAnimation() {
        if (!animationFrameId && canvas && !motionQuery.matches) {
            resizeCanvas();
            initParticles();
            animateParticles();
        }
    }
    function stopAnimation() {
         if (animationFrameId) {
             cancelAnimationFrame(animationFrameId);
             animationFrameId = null;
             ctx?.clearRect(0, 0, canvas?.width || 0, canvas?.height || 0);
         }
    }

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
            if (!motionQuery.matches && animationFrameId) { // Only resize/reinit if running
                resizeCanvas();
                initParticles(); // Re-initialize on resize for better distribution
            } else if (!motionQuery.matches && !animationFrameId) {
                 resizeCanvas(); // Still resize canvas element even if animation is off
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
            const date = dayjs(dateString);
            return date.isValid() ? date.format('YYYY-MM-DD') : '';
        } catch (e) { console.error("Date input formatting error:", e); return ''; }
    }

    function formatDateForDisplay(dateString) {
        if (!dateString) return null;
        try {
            const date = dayjs(dateString);
            if (!date.isValid()) return null;

            if (date.isToday()) return 'Today';
            if (date.isTomorrow()) return 'Tomorrow';
            // Check if it's within the next 7 days (including today) but not today/tomorrow
            const nextWeekStart = dayjs().add(1, 'day').endOf('day'); // From tomorrow onwards
             const nextWeekEnd = dayjs().add(7, 'days').endOf('day');
             if (date.isAfter(nextWeekStart) && date.isBefore(nextWeekEnd)) {
                 return date.format('ddd'); // e.g., Mon, Tue
             }
            // Older than today or further than a week out
            return date.format('MMM D');
        } catch (e) { console.error("Date display formatting error:", e); return null; }
    }


    function isDateOverdue(dateString) {
        if (!dateString) return false;
        try {
             const dueDate = dayjs(dateString).startOf('day');
             return dueDate.isValid() && dueDate.isBefore(dayjs().startOf('day'));
        } catch (e) { console.error("Date overdue check error:", e); return false; }
    }

    // Basic text sanitization
    function sanitizeText(text) {
        if (typeof text !== 'string') return '';
        const temp = document.createElement('div');
        temp.textContent = text;
        return temp.innerHTML;
    }

     // Show input error message
    function showInputError(message) {
        if (!taskInput || !inputError) return;
        taskInput.classList.add('invalid');
        taskInput.setAttribute('aria-invalid', 'true');
        taskInput.setAttribute('aria-describedby', 'input-error');
        inputError.textContent = message;
        inputError.classList.add('visible');

        // Hide after a delay
        setTimeout(() => {
            taskInput.classList.remove('invalid');
            taskInput.removeAttribute('aria-invalid');
            taskInput.removeAttribute('aria-describedby');
            inputError.classList.remove('visible');
            inputError.textContent = '';
        }, 3000);
    }

    // --- Theme Management ---
    function applyTheme(theme) {
        if (theme === DARK_MODE_CLASS) {
            body.classList.add(DARK_MODE_CLASS);
            if (themeToggleIcon) themeToggleIcon.classList.replace('fa-sun', 'fa-moon');
            if (themeToggleBtn) themeToggleBtn.setAttribute('aria-label', 'Switch to Light Theme');
        } else {
            body.classList.remove(DARK_MODE_CLASS);
            if (themeToggleIcon) themeToggleIcon.classList.replace('fa-moon', 'fa-sun');
            if (themeToggleBtn) themeToggleBtn.setAttribute('aria-label', 'Switch to Dark Theme');
        }
         updateSortArrowColor(); // Update arrow based on current theme
    }

    function updateSortArrowColor() {
         if (!sortSelect) return; // Make sure element exists
         try {
            // Use a slight delay to ensure CSS variables are applied
             requestAnimationFrame(() => {
                const arrowColor = getComputedStyle(document.documentElement).getPropertyValue('--text-light').trim().substring(1);
                // URL encode the hash symbol
                const svgUrl = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='5'%3E%3Cpath d='M0 0l5 5 5-5z' fill='%23${arrowColor}'/%3E%3C/svg%3E`;
                sortSelect.style.backgroundImage = `url("${svgUrl}")`;
            });
         } catch (e) { console.warn("Could not update sort arrow color", e); }
    }

    function toggleTheme() {
        const currentTheme = body.classList.contains(DARK_MODE_CLASS) ? DARK_MODE_CLASS : '';
        const newTheme = currentTheme === DARK_MODE_CLASS ? '' : DARK_MODE_CLASS;
        localStorage.setItem(LOCAL_STORAGE_THEME_KEY, newTheme);
        applyTheme(newTheme);
    }

    function loadTheme() {
        const preferredTheme = localStorage.getItem(LOCAL_STORAGE_THEME_KEY);
        if (preferredTheme === null) {
            if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
                applyTheme(DARK_MODE_CLASS);
            } else {
                applyTheme('');
            }
        } else {
            applyTheme(preferredTheme);
        }
         // Listen for system changes ONLY if no user preference is set
         window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', event => {
            if (localStorage.getItem(LOCAL_STORAGE_THEME_KEY) === null) {
                applyTheme(event.matches ? DARK_MODE_CLASS : '');
            }
        });
    }

    // --- Core Functions ---
    function loadTasks() {
        const storedTasks = localStorage.getItem(LOCAL_STORAGE_TASKS_KEY);
        try {
             tasks = storedTasks ? JSON.parse(storedTasks) : [];
             if (!Array.isArray(tasks)) tasks = []; // Ensure it's an array
        } catch (e) {
             console.error("Error parsing tasks from localStorage:", e);
             tasks = []; // Reset to empty array on error
             localStorage.removeItem(LOCAL_STORAGE_TASKS_KEY); // Clear corrupted data
        }

        // Sanitize and initialize task properties
        tasks = tasks.map(task => ({
            id: task.id || Date.now().toString() + Math.random(),
            createdAt: task.createdAt || parseInt(task.id) || Date.now(),
            text: sanitizeText(task.text || 'Untitled Task'),
            completed: !!task.completed,
            dueDate: task.dueDate || null, // Keep null if not present
            isImportant: !!task.isImportant,
            tags: Array.isArray(task.tags) ? task.tags.map(tag => sanitizeText(String(tag))) : [],
            notes: sanitizeText(task.notes || ''),
            isEditing: false, // Runtime state
            isArchived: !!task.isArchived,
            subtasks: Array.isArray(task.subtasks) ? task.subtasks.map(sub => ({
                id: sub.id || Date.now().toString() + Math.random(),
                text: sanitizeText(sub.text || 'Untitled Subtask'),
                completed: !!sub.completed,
                isEditing: false // Runtime state
            })) : []
        }));

        renderApp();
    }

    function saveTasks() {
        const tasksToSave = tasks.map(({ isEditing, ...rest }) => ({
            ...rest,
            subtasks: rest.subtasks?.map(({ isEditing: subEditing, ...subRest }) => subRest)
        }));
        try {
             localStorage.setItem(LOCAL_STORAGE_TASKS_KEY, JSON.stringify(tasksToSave));
        } catch (e) {
             console.error("Error saving tasks to localStorage:", e);
             // Maybe notify user that saving failed?
             alert("Error: Could not save tasks. Your changes might be lost.");
        }
        renderApp(); // Re-render after saving attempt
    }

    // --- Rendering ---
    function renderApp() {
        // Attempt to save any pending edits before full re-render
        if (editingTaskId) {
            saveTaskEdit(editingTaskId, false); // Save without triggering another render yet
        }
         if (editingSubtaskId) {
             // Find and save the subtask without triggering full render
             const { parentId, subtaskId, inputElement } = findEditingSubtaskDetails();
             if (parentId && subtaskId && inputElement) {
                 handleSubtaskEditSave({ target: inputElement }, false); // Pass event-like object, don't trigger render
             } else {
                  // If details not found, just cancel the state
                 cancelSubtaskEditMode(null, editingSubtaskId, false);
             }
         }
         editingTaskId = null; // Ensure these are cleared after attempted saves/cancels
         editingSubtaskId = null;

        const filteredAndSortedTasks = getFilteredAndSortedTasks();
        renderTaskList(filteredAndSortedTasks);
        updateAppStats();
        renderTagFilters();
        updateFilterButtons();
        updateDraggability();
    }

    function getFilteredAndSortedTasks() {
        let processedTasks = [...tasks];

        // 1. Filter by Archive Status
        if (currentFilter === 'archived') {
            processedTasks = processedTasks.filter(task => task.isArchived);
        } else {
            processedTasks = processedTasks.filter(task => !task.isArchived);
        }

        // 2. Apply Search (only on non-archived tasks)
        if (currentSearchTerm && currentFilter !== 'archived') {
            const lowerSearchTerm = currentSearchTerm.toLowerCase();
            processedTasks = processedTasks.filter(task =>
                task.text.toLowerCase().includes(lowerSearchTerm) ||
                (task.notes && task.notes.toLowerCase().includes(lowerSearchTerm)) ||
                task.tags.some(tag => tag.toLowerCase().includes(lowerSearchTerm)) ||
                task.subtasks.some(sub => sub.text.toLowerCase().includes(lowerSearchTerm))
            );
        }

        // 3. Apply Main Filter (if not 'archived')
        if (currentFilter !== 'archived') {
            processedTasks = processedTasks.filter(task => {
                if (currentFilter === 'active') return !task.completed;
                if (currentFilter === 'completed') return task.completed;
                if (currentFilter === 'important') return task.isImportant && !task.completed;
                if (currentFilter.startsWith('tag:')) {
                    const tag = currentFilter.substring(4).toLowerCase();
                    return task.tags.some(t => t.toLowerCase() === tag);
                }
                return true; // 'all'
            });
        }

        // 4. Apply Sorting
         if (currentFilter === 'archived') {
             // Archived tasks are always sorted by creation date, newest first
             processedTasks.sort((a, b) => b.createdAt - a.createdAt);
         } else if (currentSort !== 'manual') {
            processedTasks.sort((a, b) => {
                 // Group completed tasks at the bottom in most views
                 if (currentFilter !== 'completed' && a.completed !== b.completed) {
                     return a.completed ? 1 : -1;
                 }

                switch (currentSort) {
                    case 'creation-asc': return a.createdAt - b.createdAt;
                    case 'due-date':
                        const dateA = a.dueDate ? dayjs(a.dueDate) : null;
                        const dateB = b.dueDate ? dayjs(b.dueDate) : null;
                        const now = dayjs().startOf('day');

                        const score = (date) => {
                            if (!date || !date.isValid()) return 5; // No date last
                            if (date.isBefore(now)) return 1;   // Overdue
                            if (date.isToday()) return 2;       // Today
                            if (date.isTomorrow()) return 3;    // Tomorrow
                            return 4;                           // Future
                        };

                        const scoreA = score(dateA);
                        const scoreB = score(dateB);

                        if (scoreA !== scoreB) return scoreA - scoreB; // Sort by category

                        // If same category, sort by actual date (earlier first)
                        if (dateA && dateB && dateA.isValid() && dateB.isValid()) {
                            if (dateA.isBefore(dateB)) return -1;
                            if (dateA.isAfter(dateB)) return 1;
                        }
                        // If dates are same or one is invalid, fallback to creation date (newest first)
                        return b.createdAt - a.createdAt;
                    case 'priority':
                        if (a.isImportant !== b.isImportant) return a.isImportant ? -1 : 1; // Important first
                        return b.createdAt - a.createdAt; // Then newest first
                    case 'alphabetical':
                         return a.text.localeCompare(b.text, undefined, { sensitivity: 'base' }); // Case-insensitive compare
                    case 'creation-desc':
                    default: return b.createdAt - a.createdAt; // Default: newest first
                }
            });
        }
        // If sort is 'manual', the order is preserved from the filtered `tasks` array.

        return processedTasks;
    }


    function renderTaskList(tasksToRender) {
        if (!taskList) return;
        taskList.innerHTML = ''; // Clear previous list

        // Determine which state message to show
        const totalRelevantTasks = tasks.filter(t => currentFilter === 'archived' ? t.isArchived : !t.isArchived).length;
        const showEmptyInitial = totalRelevantTasks === 0 && currentFilter === 'all' && currentSearchTerm === '';
        const showNoResultsSearch = totalRelevantTasks > 0 && tasksToRender.length === 0 && currentSearchTerm !== '';
        const showNoResultsFilter = totalRelevantTasks > 0 && tasksToRender.length === 0 && currentSearchTerm === '' && currentFilter !== 'all';
        const showEmptyArchive = currentFilter === 'archived' && tasksToRender.length === 0;
        const showEmptyCompleted = currentFilter === 'completed' && tasksToRender.length === 0 && totalRelevantTasks > 0;
        const showEmptyImportant = currentFilter === 'important' && tasksToRender.length === 0 && totalRelevantTasks > 0;
        const showEmptyTag = currentFilter.startsWith('tag:') && tasksToRender.length === 0 && totalRelevantTasks > 0;

        // Hide all states initially
        if(emptyState) emptyState.style.display = 'none';
        if(noResultsState) noResultsState.style.display = 'none';

        if (showEmptyInitial) {
            if(emptyState) {
                emptyState.innerHTML = `<i class="fas fa-clipboard-list empty-icon"></i><br>No tasks yet! Add your first task above (N).`;
                emptyState.style.display = 'block';
                emptyState.classList.add('show');
            }
        } else if (showNoResultsSearch) {
             if(noResultsState) {
                noResultsState.innerHTML = `<i class="fas fa-search empty-icon"></i><br>No tasks match your search: "${sanitizeText(currentSearchTerm)}".`;
                noResultsState.style.display = 'block';
                noResultsState.classList.add('show');
            }
        } else if (showEmptyArchive) {
             if(noResultsState) {
                noResultsState.innerHTML = `<i class="fas fa-archive empty-icon"></i><br>Your archive is empty.`;
                noResultsState.style.display = 'block';
                noResultsState.classList.add('show');
            }
        } else if (showEmptyCompleted) {
             if(noResultsState) {
                noResultsState.innerHTML = `<i class="fas fa-check-circle empty-icon"></i><br>No completed tasks found.`;
                noResultsState.style.display = 'block';
                noResultsState.classList.add('show');
            }
        } else if (showEmptyImportant) {
             if(noResultsState) {
                noResultsState.innerHTML = `<i class="fas fa-star empty-icon"></i><br>No important tasks found.`;
                noResultsState.style.display = 'block';
                noResultsState.classList.add('show');
            }
        } else if (showEmptyTag) {
             const tagName = sanitizeText(currentFilter.substring(4));
             if(noResultsState) {
                noResultsState.innerHTML = `<i class="fas fa-tag empty-icon"></i><br>No tasks found with the tag "${tagName}".`;
                noResultsState.style.display = 'block';
                noResultsState.classList.add('show');
            }
        } else if (showNoResultsFilter) { // Generic "no results for filter"
             if(noResultsState) {
                noResultsState.innerHTML = `<i class="fas fa-filter empty-icon"></i><br>No tasks match the current filter.`;
                noResultsState.style.display = 'block';
                noResultsState.classList.add('show');
            }
        } else {
             // Render tasks if there are any
             tasksToRender.forEach(task => {
                const li = createTaskElement(task);
                taskList.appendChild(li);
                 // Animation (if not reduced motion)
                 if (!motionQuery.matches) {
                     requestAnimationFrame(() => {
                         requestAnimationFrame(() => {
                             li.classList.remove('task-entering');
                         });
                     });
                 } else {
                      li.classList.remove('task-entering'); // Remove immediately if reduced motion
                 }
            });
        }
    }


    function updateAppStats() {
         const nonArchivedTasks = tasks.filter(task => !task.isArchived);
        const totalTasks = nonArchivedTasks.length;
        const completedTasksCount = nonArchivedTasks.filter(task => task.completed).length;
        const activeTasksCount = totalTasks - completedTasksCount;

        if(activeTaskCountElement) activeTaskCountElement.textContent = activeTasksCount;
        updateArchiveButtonState(completedTasksCount > 0);

        const progress = totalTasks === 0 ? 0 : Math.round((completedTasksCount / totalTasks) * 100);
        if(progressBar) progressBar.style.width = `${progress}%`;
        if(progressText) progressText.textContent = `${progress}% Complete`;
    }

     function renderTagFilters() {
        if (!tagFilterContainer) return;
        const nonArchivedTags = [...new Set(tasks.filter(t => !t.isArchived).flatMap(task => task.tags))].sort((a, b) => a.localeCompare(b));
        tagFilterContainer.innerHTML = '';

        nonArchivedTags.forEach(tag => {
            const button = document.createElement('button');
            button.className = 'filter-btn tag-filter';
            button.dataset.filter = `tag:${tag}`;
            const sanitizedTag = sanitizeText(tag);
            button.innerHTML = `<i class="fas fa-tag fa-xs"></i> ${sanitizedTag}`;
            button.title = `Filter by: ${sanitizedTag}`;
            tagFilterContainer.appendChild(button);
        });
         updateFilterButtons();
    }


    // --- Task Element Creation ---
    function createTaskElement(task) {
        const li = document.createElement('li');
        li.dataset.id = task.id;
        li.className = `task-item ${task.completed ? 'completed' : ''} ${task.isEditing ? 'editing' : ''} ${task.isImportant && !task.completed && !task.archived ? 'important' : ''} ${task.isArchived ? 'archived' : ''} task-entering`;
        li.draggable = !task.isEditing && !task.completed && !task.archived && currentSort === 'manual';
        li.tabIndex = -1; // Allow focus programmatic focus, but not via tab initially

        const taskWrapper = document.createElement('div');
        taskWrapper.className = 'task-wrapper';

        const dragHandle = document.createElement('span');
        dragHandle.className = 'drag-handle';
        dragHandle.innerHTML = '<i class="fas fa-grip-vertical"></i>';
        dragHandle.style.display = li.draggable ? '' : 'none';
        dragHandle.setAttribute('aria-hidden', 'true'); // Hide from screen readers
        dragHandle.addEventListener('click', e => e.stopPropagation());

        const taskContent = document.createElement('div');
        taskContent.className = 'task-content';

        // --- Display Area ---
        const taskDisplay = document.createElement('div');
        taskDisplay.className = 'task-display';
        const taskMainLine = document.createElement('div');
        taskMainLine.className = 'task-main-line';
        const taskText = document.createElement('span');
        taskText.className = 'task-text';
        taskText.innerHTML = sanitizeText(task.text); // Sanitize
        // Add listeners only if not archived
        if (!task.archived) {
             taskText.addEventListener('dblclick', (e) => { e.stopPropagation(); if (!task.completed) enterEditMode(task.id); });
             taskText.addEventListener('click', (e) => { e.stopPropagation(); if (!task.isEditing) toggleTaskCompletion(task.id); });
        } else {
            taskText.style.cursor = 'default'; // No pointer cursor for archived tasks
        }
        taskMainLine.appendChild(taskText);
        taskDisplay.appendChild(taskMainLine);

        // Task Meta (Date, Notes, Tags)
        const taskMeta = document.createElement('div');
        taskMeta.className = 'task-meta';
        const formattedDate = formatDateForDisplay(task.dueDate);
        if (formattedDate) {
            const dueDateSpan = document.createElement('span');
            dueDateSpan.className = 'due-date';
            const isOverdue = !task.completed && !task.archived && isDateOverdue(task.dueDate);
            dueDateSpan.innerHTML = `<i class="far ${isOverdue ? 'fa-exclamation-circle' : 'fa-calendar-alt'}"></i> ${formattedDate}`;
            if (isOverdue) {
                dueDateSpan.classList.add('overdue');
                dueDateSpan.title = `Overdue: ${dayjs(task.dueDate).format('ll')}`;
            } else {
                 dueDateSpan.title = `Due: ${dayjs(task.dueDate).format('ll')}`;
            }
            taskMeta.appendChild(dueDateSpan);
        }
        if (task.notes && !task.archived) { // Don't show notes indicator for archived
             const notesIndicator = document.createElement('span');
             notesIndicator.className = 'notes-indicator';
             notesIndicator.innerHTML = '<i class="far fa-sticky-note fa-sm"></i>'; // Smaller icon
             notesIndicator.title = `Notes: ${sanitizeText(task.notes)}`;
             notesIndicator.style.color = 'var(--text-light)';
             notesIndicator.style.opacity = '0.8';
             taskMeta.appendChild(notesIndicator);
        }
        if (task.tags.length > 0) {
            const tagsContainer = document.createElement('div');
            tagsContainer.className = 'tags-container';
            task.tags.forEach(tag => {
                const tagSpan = document.createElement('span');
                tagSpan.className = 'tag-item';
                const sanitizedTag = sanitizeText(tag);
                tagSpan.innerHTML = sanitizedTag;
                tagSpan.title = `Filter by tag: ${sanitizedTag}`;
                // Only allow tag filtering if not in archive view
                 if (!task.archived) {
                    tagSpan.addEventListener('click', (e) => {
                         e.stopPropagation();
                         changeFilter(`tag:${tag}`);
                    });
                 } else {
                    tagSpan.style.cursor = 'default';
                    tagSpan.style.textDecoration = 'line-through'; // Match other archived text
                 }
                tagsContainer.appendChild(tagSpan);
            });
             taskMeta.appendChild(tagsContainer);
        }
         if (taskMeta.children.length > 0) {
             taskDisplay.appendChild(taskMeta);
         }

        // --- Edit Controls Area ---
        const editControls = document.createElement('div');
        editControls.className = 'edit-controls';
        editControls.addEventListener('click', e => e.stopPropagation());
        const editInput = document.createElement('input');
        editInput.type = 'text'; editInput.className = 'edit-input'; editInput.value = task.text; editInput.required = true;
        editInput.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveTaskEdit(task.id); } else if (e.key === 'Escape') { cancelEditMode(task.id); } });
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
        editPriorityToggle.tabIndex = 0;
        editPriorityToggle.addEventListener('click', () => editPriorityToggle.classList.toggle('active'));
        editPriorityToggle.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); editPriorityToggle.classList.toggle('active'); }});
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
         if (!task.archived && task.subtasks.length > 0) { // Only render list if subtasks exist and not archived
             task.subtasks.forEach(subtask => {
                 const subLi = createSubtaskElement(task.id, subtask);
                 subtaskList.appendChild(subLi);
             });
         }

        // Add Subtask Input (only visible in edit mode, and not archived)
        const addSubtaskWrapper = document.createElement('div');
        addSubtaskWrapper.className = 'add-subtask-wrapper';
        const addSubtaskInput = document.createElement('input');
        addSubtaskInput.type = 'text';
        addSubtaskInput.placeholder = '+ Add subtask (Enter)';
        addSubtaskInput.className = 'add-subtask-input';
        addSubtaskInput.setAttribute('aria-label', 'Add a new subtask');
        addSubtaskInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && addSubtaskInput.value.trim()) {
                e.preventDefault();
                addSubtask(task.id, addSubtaskInput.value.trim());
                addSubtaskInput.value = '';
                // addSubtaskInput.focus(); // Re-focusing is hard after re-render
            } else if (e.key === 'Escape') {
                 addSubtaskInput.value = '';
                 editInput.focus(); // Focus back on main task input
            }
        });
        addSubtaskWrapper.appendChild(addSubtaskInput);

        // --- Action Buttons ---
        const taskActions = document.createElement('div');
        taskActions.className = 'task-actions';

        if (task.isArchived) {
            const unarchiveBtn = createActionButton('unarchive-btn', 'fa-box-open', 'Unarchive Task', () => unarchiveTask(task.id));
            const permDeleteBtn = createActionButton('perm-delete-btn', 'fa-trash-alt', 'Delete Permanently', () => confirmDeleteTask(task.id, true));
            taskActions.appendChild(unarchiveBtn);
            taskActions.appendChild(permDeleteBtn);
        } else if (task.isEditing) {
            const saveBtn = createActionButton('save-btn', 'fa-save', 'Save Changes (Enter)', () => saveTaskEdit(task.id));
            const cancelBtn = createActionButton('cancel-edit-btn', 'fa-times', 'Cancel Edit (Esc)', () => cancelEditMode(task.id));
            cancelBtn.style.color = 'var(--delete-color)';
            taskActions.appendChild(saveBtn);
            taskActions.appendChild(cancelBtn);
        } else { // Active or Completed (but not archived/editing)
            const priorityBtn = createActionButton(
                `priority-toggle-btn ${task.isImportant ? 'important' : ''}`,
                'fa-star',
                task.isImportant ? 'Remove priority' : 'Mark as important',
                () => togglePriority(task.id),
                task.completed // Hide if completed
            );
            const completeBtn = createActionButton(
                'complete-btn',
                task.completed ? 'fa-undo' : 'fa-check',
                task.completed ? 'Mark as active' : 'Mark as complete',
                () => toggleTaskCompletion(task.id)
            );
            const editBtn = createActionButton(
                'edit-btn',
                'fa-pencil-alt',
                'Edit task (Double-click text)',
                () => enterEditMode(task.id),
                task.completed // Hide if completed
            );
            const deleteBtn = createActionButton(
                'delete-btn',
                'fa-trash',
                'Delete task',
                () => confirmDeleteTask(task.id, false)
            );

            taskActions.appendChild(priorityBtn);
            taskActions.appendChild(completeBtn);
            taskActions.appendChild(editBtn);
            taskActions.appendChild(deleteBtn);
        }

        // Assemble the task item
        taskWrapper.appendChild(dragHandle);
        taskWrapper.appendChild(taskContent);
        taskWrapper.appendChild(taskActions);

        li.appendChild(taskWrapper);
        if (!task.archived && task.subtasks.length > 0) { // Append existing subtasks list
             li.appendChild(subtaskList);
        }
        if (!task.archived && task.isEditing) { // Append add-subtask input only in edit mode
            li.appendChild(addSubtaskWrapper);
             requestAnimationFrame(() => { // Focus after render
                const focusedInput = li.querySelector('.edit-input');
                if (focusedInput) {
                     focusedInput.focus();
                     focusedInput.select();
                }
             });
        }

        return li;
    }

     // Helper function to create action buttons
     function createActionButton(className, iconClass, title, onClick, hidden = false) {
        const button = document.createElement('button');
        button.className = `action-btn ${className}`;
        button.innerHTML = `<i class="fas ${iconClass}"></i>`;
        button.title = title;
        button.setAttribute('aria-label', title);
        button.style.display = hidden ? 'none' : '';
        button.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
        return button;
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
        checkbox.title = 'Toggle subtask completion';
        checkbox.setAttribute('aria-label', `Subtask: ${subtask.text} - ${subtask.completed ? 'Completed' : 'Active'}`);
        checkbox.addEventListener('change', () => toggleSubtaskCompletion(parentId, subtask.id));
        checkbox.addEventListener('click', e => e.stopPropagation());

        const subText = document.createElement('span');
        subText.className = 'subtask-text';
        subText.innerHTML = sanitizeText(subtask.text);
        subText.addEventListener('dblclick', (e) => {
             e.stopPropagation();
             if (!subtask.completed) enterSubtaskEditMode(parentId, subtask.id, subLi);
        });
        subText.addEventListener('click', (e) => {
             e.stopPropagation();
             if (!subtask.isEditing) toggleSubtaskCompletion(parentId, subtask.id);
        });

        const deleteSubBtn = createActionButton( // Use helper
            'delete-subtask-btn',
            'fa-times',
            'Delete subtask',
            (e) => { confirmDeleteSubtask(parentId, subtask.id, subtask.text); }
        );

        subLi.appendChild(checkbox);
        subLi.appendChild(subText); // Span initially
        subLi.appendChild(deleteSubBtn);

        if (subtask.isEditing) { // If state is already editing, render input immediately
             renderSubtaskEditInput(parentId, subtask.id, subLi, subtask.text);
        }

        return subLi;
    }

    // --- Task Manipulation ---
    function parseTaskInput(rawText) {
        let text = rawText;
        let tags = [];
        let isImportant = false;
        let dueDate = null;
        let error = null; // To store parsing errors

        // Regex patterns
        const tagRegex = /([@#])([\w-]+)/g; // Allow hyphens in tags
        const priorityRegex = /\b(p:high|!important)\b/gi;
        const dueRegex = /due:(\S+)/i;

        // 1. Extract Due Date
        const dueMatch = text.match(dueRegex);
        if (dueMatch) {
            const fullMatch = dueMatch[0];
            const dateStr = dueMatch[1].toLowerCase();
            let parsedDate = null;

            if (dateStr === 'today') parsedDate = dayjs().startOf('day');
            else if (dateStr === 'tomorrow') parsedDate = dayjs().add(1, 'day').startOf('day');
            else if (dateStr === 'nextweek' || dateStr === 'next-week') parsedDate = dayjs().add(1, 'week').startOf('isoWeek');
            // Try YYYY-MM-DD format strictly
            else parsedDate = dayjs(dateStr, 'YYYY-MM-DD', true);

            // Allow relative days like 'mon', 'tue', etc. within the next week
             if (!parsedDate.isValid()) {
                 const weekdays = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
                 const dayIndex = weekdays.indexOf(dateStr.substring(0, 3));
                 if (dayIndex !== -1) {
                     let targetDate = dayjs().day(dayIndex); // Get date for this weekday
                     if (targetDate.isBefore(dayjs().startOf('day'))) { // If it's already passed this week
                         targetDate = targetDate.add(1, 'week'); // Go to next week's day
                     }
                     parsedDate = targetDate.startOf('day');
                 }
             }

            if (parsedDate && parsedDate.isValid()) {
                dueDate = parsedDate.format('YYYY-MM-DD');
                text = text.replace(fullMatch, '').trim(); // Remove from text *after* successful parse
            } else {
                error = `Invalid date: "${dateStr}". Use YYYY-MM-DD, today, tomorrow, next week, or Mon-Sun.`;
                 // Don't remove the invalid due: string from text yet
            }
        }

        // 2. Extract Priority (from potentially modified text)
        const priorityMatch = text.match(priorityRegex);
         if (priorityMatch) {
            isImportant = true;
            // Remove *only the first occurrence* in case it's part of the task text itself
            text = text.replace(priorityRegex, '').replace(/\s+/g, ' ').trim();
        }


        // 3. Extract Tags (from original text to avoid removing parts of task)
        let tagMatch;
        while ((tagMatch = tagRegex.exec(rawText)) !== null) {
            const tagName = tagMatch[2].toLowerCase();
            if (tagName) tags.push(tagName);
             // Now remove this specific tag match from the final text
             text = text.replace(tagMatch[0], '').replace(/\s+/g, ' ').trim();
        }

        // Final cleanup
        text = text.replace(/\s+/g, ' ').trim();

        // Return error if found
        if (error) {
             showInputError(error);
             return null;
        }

        // Return null if text is empty after parsing
        if (!text) {
            showInputError("Task description cannot be empty after parsing keywords.");
            return null;
        }

        return {
            text: text,
            tags: [...new Set(tags)],
            isImportant: isImportant,
            dueDate: dueDate
        };
    }

    function addTask(event) {
        event.preventDefault();
        if (!taskInput) return;
        const rawText = taskInput.value.trim();
        if (!rawText) {
             showInputError("Please enter a task description.");
             return;
        }

        const parsedData = parseTaskInput(rawText);

        if (!parsedData) {
             // Error handled by parseTaskInput
             taskInput.focus(); // Keep focus on input for correction
             return;
        }

        const newTask = {
            id: Date.now().toString(),
            createdAt: Date.now(),
            text: parsedData.text,
            completed: false,
            dueDate: parsedData.dueDate,
            isImportant: parsedData.isImportant,
            tags: parsedData.tags,
            notes: '',
            isEditing: false,
            subtasks: [],
            isArchived: false
        };

        // Insert based on sort order or manually at top
         if (currentSort === 'manual' && currentFilter !== 'archived') {
            const firstInvalidIndex = tasks.findIndex(t => t.completed || t.isArchived);
            if (firstInvalidIndex !== -1) {
                tasks.splice(firstInvalidIndex, 0, newTask); // Insert before first completed/archived
            } else {
                tasks.push(newTask); // Add to end if only active tasks
            }
        } else {
             tasks.unshift(newTask); // Add to the very beginning
        }


        taskInput.value = '';

        // Switch view if necessary, otherwise just save and render
        if (currentFilter === 'completed' || currentFilter === 'archived') {
            changeFilter('all'); // This triggers saveTasks via renderApp
        } else {
            saveTasks();
        }
        taskInput.focus();
    }


    function toggleTaskCompletion(id) {
        if (editingTaskId === id) return;
        const taskIndex = tasks.findIndex(task => task.id === id);
        if (taskIndex > -1 && !tasks[taskIndex].isArchived) {
            tasks[taskIndex].completed = !tasks[taskIndex].completed;
            saveTasks();
        }
    }

     function togglePriority(id) {
         if (editingTaskId === id) return;
         const taskIndex = tasks.findIndex(task => task.id === id);
         if (taskIndex > -1 && !tasks[taskIndex].completed && !tasks[taskIndex].isArchived) {
             tasks[taskIndex].isImportant = !tasks[taskIndex].isImportant;
             saveTasks();
         }
     }

    function enterEditMode(id) {
         if (editingSubtaskId) cancelSubtaskEditMode(); // Cancel subtask edit first
         if (editingTaskId && editingTaskId !== id) saveTaskEdit(editingTaskId, false); // Save previous

        const taskIndex = tasks.findIndex(task => task.id === id);
        if (taskIndex > -1 && !tasks[taskIndex].completed && !tasks[taskIndex].isArchived) {
            tasks.forEach((task) => task.isEditing = (task.id === id));
            editingTaskId = id;
            renderTaskList(getFilteredAndSortedTasks()); // Re-render list to show inputs
            updateDraggability();
        }
    }

     function cancelEditMode(id, triggerRender = true) {
         const taskIndex = tasks.findIndex(task => task.id === id);
         if (taskIndex > -1 && tasks[taskIndex].isEditing) {
             tasks[taskIndex].isEditing = false;
             editingTaskId = null;
             if (triggerRender) {
                 renderTaskList(getFilteredAndSortedTasks()); // Re-render display mode
                 updateDraggability();
                 // Focus the task item after render
                 const taskElement = taskList.querySelector(`li.task-item[data-id="${id}"]`);
                 requestAnimationFrame(() => taskElement?.focus());
             }
         } else if (editingTaskId === id) {
              // If state was inconsistent, just clear global ID
              editingTaskId = null;
         }
     }


    function saveTaskEdit(id, triggerRender = true) {
        const taskIndex = tasks.findIndex(task => task.id === id);
        // Ensure task exists and IS the one being edited
        if (taskIndex === -1 || editingTaskId !== id) {
             if (editingTaskId === id) editingTaskId = null; // Clear if it was supposed to be this one
             if (triggerRender) renderApp(); // Render anyway to fix potential inconsistencies
             return;
        }

        // Find the list item IF it's currently rendered
        const li = taskList.querySelector(`li.task-item[data-id="${id}"]`);
        let newText, newDueDate, newTags = [], newNotes, newImportance;

        // Get data from inputs IF the element exists
        if (li) {
            const editInput = li.querySelector('.edit-input');
            const dateInput = li.querySelector('.date-input');
            const tagsInput = li.querySelector('.tags-input');
            const notesInput = li.querySelector('.notes-input');
            const editPriorityToggle = li.querySelector('.edit-priority-toggle');

            // Basic validation within save function
            if (!editInput) { console.error("Edit input not found for task:", id); return; } // Should not happen
            newText = editInput.value.trim();
            if (!newText) {
                 editInput.style.borderColor = 'var(--delete-color)';
                 editInput.focus();
                 setTimeout(() => { editInput.style.borderColor = ''; }, 1500);
                 console.warn("Task text cannot be empty. Edit not saved.");
                 return; // Prevent saving empty task
            }

            newDueDate = dateInput?.value || null; // Get value or null
            newTags = tagsInput?.value.split(',')
                             .map(tag => tag.trim().toLowerCase().replace(/[^a-z0-9_-]/g, ''))
                             .filter(tag => tag.length > 0) || [];
            newNotes = notesInput?.value.trim() || '';
            newImportance = editPriorityToggle?.classList.contains('active') || false;

        } else {
             // Task was being edited but element not rendered (e.g., filtered out)
             // Cannot get values, so just cancel the edit state
             console.warn(`Task ${id} was editing but not rendered. Edit cancelled.`);
             tasks[taskIndex].isEditing = false;
             editingTaskId = null;
             if (triggerRender) renderApp();
             else updateDraggability();
             return;
        }

        // Update task data
        tasks[taskIndex].text = newText;
        tasks[taskIndex].dueDate = newDueDate;
        tasks[taskIndex].tags = [...new Set(newTags)];
        tasks[taskIndex].notes = newNotes;
        tasks[taskIndex].isImportant = newImportance;
        tasks[taskIndex].isEditing = false; // Exit editing state
        editingTaskId = null; // Clear global ID

        if (triggerRender) {
             saveTasks(); // Save and trigger full re-render
             // Focus the task item after saving/re-rendering
             const taskElement = taskList.querySelector(`li.task-item[data-id="${id}"]`);
             requestAnimationFrame(() => taskElement?.focus());
        } else {
             updateDraggability(); // Just update draggable status if not re-rendering
        }
    }

    // --- Subtask Manipulation ---
    function addSubtask(parentId, text) {
        const parentTaskIndex = tasks.findIndex(task => task.id === parentId);
        if (parentTaskIndex > -1 && !tasks[parentTaskIndex].completed && !tasks[parentTaskIndex].isArchived) {
            const newSubtask = {
                id: Date.now().toString() + Math.random(),
                text: text,
                completed: false,
                isEditing: false
            };
            tasks[parentTaskIndex].subtasks.push(newSubtask);
            saveTasks(); // Save and re-render
        }
    }

    function toggleSubtaskCompletion(parentId, subtaskId) {
        if (editingSubtaskId === subtaskId) return;
         const parentTaskIndex = tasks.findIndex(task => task.id === parentId);
         if (parentTaskIndex > -1 && !tasks[parentTaskIndex].isArchived) {
             const subtaskIndex = tasks[parentTaskIndex].subtasks.findIndex(sub => sub.id === subtaskId);
             if (subtaskIndex > -1) {
                 tasks[parentTaskIndex].subtasks[subtaskIndex].completed = !tasks[parentTaskIndex].subtasks[subtaskIndex].completed;
                 saveTasks();
             }
         }
    }

    function findEditingSubtaskDetails() {
        if (!editingSubtaskId) return {};
        for (const task of tasks) {
            const subtaskIndex = task.subtasks.findIndex(sub => sub.id === editingSubtaskId && sub.isEditing);
            if (subtaskIndex !== -1) {
                 const subLi = taskList?.querySelector(`li.subtask-item[data-id="${editingSubtaskId}"]`);
                 const inputElement = subLi?.querySelector('.subtask-edit-input');
                 return { parentId: task.id, subtaskId: editingSubtaskId, subtaskIndex, inputElement };
            }
        }
        return {}; // Not found
    }


     function enterSubtaskEditMode(parentId, subtaskId, subtaskLiElement) {
         if (editingTaskId) cancelEditMode(editingTaskId); // Cancel main edit first
         if (editingSubtaskId && editingSubtaskId !== subtaskId) { // Save/Cancel previous subtask edit
              const { inputElement: prevInput } = findEditingSubtaskDetails();
              if (prevInput) handleSubtaskEditSave({ target: prevInput }, false); // Save previous on blur implicitly
              else cancelSubtaskEditMode(null, editingSubtaskId, false); // Or just cancel state if no input
         }

         const parentTaskIndex = tasks.findIndex(task => task.id === parentId);
         if (parentTaskIndex > -1) {
             const subtaskIndex = tasks[parentTaskIndex].subtasks.findIndex(sub => sub.id === subtaskId);
             if (subtaskIndex > -1 && !tasks[parentTaskIndex].subtasks[subtaskIndex].completed && !tasks[parentTaskIndex].isArchived) {
                 tasks[parentTaskIndex].subtasks[subtaskIndex].isEditing = true;
                 editingSubtaskId = subtaskId;
                 renderSubtaskEditInput(parentId, subtaskId, subtaskLiElement, tasks[parentTaskIndex].subtasks[subtaskIndex].text);
             }
         }
     }

     function renderSubtaskEditInput(parentId, subtaskId, subtaskLiElement, currentText) {
        const subTextSpan = subtaskLiElement.querySelector('.subtask-text');
        const checkbox = subtaskLiElement.querySelector('.subtask-checkbox');
        const deleteBtn = subtaskLiElement.querySelector('.delete-subtask-btn');

        if (!subTextSpan || subtaskLiElement.querySelector('.subtask-edit-input')) return; // Already editing or span missing

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'subtask-edit-input';
        input.value = currentText;
        input.dataset.parentId = parentId;
        input.dataset.subtaskId = subtaskId;
        input.setAttribute('aria-label', `Edit subtask: ${currentText}`);

        // Event listeners
        input.addEventListener('blur', (e) => handleSubtaskEditSave(e, true)); // Trigger full save/render on blur
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); handleSubtaskEditSave(e, true); } // Trigger save/render
            else if (e.key === 'Escape') { e.preventDefault(); cancelSubtaskEditMode(parentId, subtaskId, true); } // Trigger cancel/render
        });

        // DOM manipulation
        subtaskLiElement.replaceChild(input, subTextSpan);
        if(checkbox) checkbox.style.visibility = 'hidden';
        if(deleteBtn) deleteBtn.style.visibility = 'hidden';

        input.select();
     }

     function handleSubtaskEditSave(event, triggerRender = true) {
         const input = event.target;
         if (!input || !input.classList.contains('subtask-edit-input')) return; // Ensure it's the correct input

         const parentId = input.dataset.parentId;
         const subtaskId = input.dataset.subtaskId;
         const newText = input.value.trim();

          // Only proceed if this IS the globally tracked editing subtask
         if (editingSubtaskId !== subtaskId) {
             // console.warn("Stale subtask edit event ignored.");
             return;
         }

         const parentTaskIndex = tasks.findIndex(task => task.id === parentId);
         if (parentTaskIndex > -1) {
             const subtaskIndex = tasks[parentTaskIndex].subtasks.findIndex(sub => sub.id === subtaskId);
             if (subtaskIndex > -1 && tasks[parentTaskIndex].subtasks[subtaskIndex].isEditing) {
                 if (newText) {
                     tasks[parentTaskIndex].subtasks[subtaskIndex].text = newText;
                 } else {
                     console.warn("Subtask text cannot be empty. Edit cancelled.");
                     // Keep original text by not updating it before setting isEditing = false
                 }
                 tasks[parentTaskIndex].subtasks[subtaskIndex].isEditing = false; // Always exit edit state
             }
         }

         editingSubtaskId = null; // Clear global state *after* potential data update
         if (triggerRender) saveTasks(); // Trigger save and full re-render
     }


     function cancelSubtaskEditMode(parentId = null, subtaskId = null, triggerRender = true) {
         const targetSubtaskId = subtaskId || editingSubtaskId;
         if (!targetSubtaskId) return;

         let found = false;
         for (let i = 0; i < tasks.length; i++) {
             const subIndex = tasks[i].subtasks.findIndex(sub => sub.id === targetSubtaskId && sub.isEditing);
             if (subIndex !== -1) {
                 tasks[i].subtasks[subIndex].isEditing = false;
                 found = true;
                 break;
             }
         }

         if (found) {
            if (editingSubtaskId === targetSubtaskId) editingSubtaskId = null; // Clear global state
            if (triggerRender) saveTasks(); // Trigger re-render
         } else if (editingSubtaskId === targetSubtaskId) {
             // If not found in data but was globally set, just clear global state
             editingSubtaskId = null;
         }
     }


    function confirmDeleteSubtask(parentId, subtaskId, subtaskText) {
         elementToFocusOnClose = document.activeElement;
         const safeText = sanitizeText(subtaskText);
         showModal(`Delete subtask "${safeText}"?`, () => {
            deleteSubtask(parentId, subtaskId);
         });
    }

    function deleteSubtask(parentId, subtaskId) {
         const parentTaskIndex = tasks.findIndex(task => task.id === parentId);
         if (parentTaskIndex > -1) {
             const initialLength = tasks[parentTaskIndex].subtasks.length;
             tasks[parentTaskIndex].subtasks = tasks[parentTaskIndex].subtasks.filter(sub => sub.id !== subtaskId);
             if (tasks[parentTaskIndex].subtasks.length < initialLength) {
                saveTasks();
             }
         }
         // Focus handled by hideModal
    }


    // --- Deletion, Confirmation, Archiving ---
     function showModal(message, onConfirm) {
        modalMessage.innerHTML = message; // Use innerHTML for sanitized text
        modalConfirmCallback = onConfirm;
        elementToFocusOnClose = document.activeElement instanceof HTMLElement ? document.activeElement : null;

        confirmationModal.style.display = 'flex';
         requestAnimationFrame(() => {
            confirmationModal.setAttribute('aria-hidden', 'false');
             modalCancelBtn.focus(); // Default focus on Cancel
         });
    }

    function hideModal() {
        confirmationModal.setAttribute('aria-hidden', 'true');
        // Use transitionend listener for smoother fade-out before hiding
         const overlay = confirmationModal;
         const content = confirmationModal.querySelector('.modal-content');

         const handleTransitionEnd = (event) => {
             // Ensure transition is on the overlay opacity
             if (event.target === overlay && event.propertyName === 'opacity') {
                 overlay.style.display = 'none';
                 overlay.removeEventListener('transitionend', handleTransitionEnd);
                 // Restore focus *after* modal is fully hidden
                 restoreFocusAfterModal();
             }
         };

         overlay.addEventListener('transitionend', handleTransitionEnd);

         // Fallback timeout in case transitionend doesn't fire
         setTimeout(() => {
             if (overlay.getAttribute('aria-hidden') === 'true' && overlay.style.display !== 'none') {
                 // console.warn("Modal hide fallback timeout.");
                 overlay.style.display = 'none';
                 overlay.removeEventListener('transitionend', handleTransitionEnd);
                 restoreFocusAfterModal();
             }
         }, 400); // Slightly longer than CSS transition

         modalConfirmCallback = null; // Clear callback immediately
    }

     function restoreFocusAfterModal() {
        if (elementToFocusOnClose) {
            try {
                // Check if element still exists and is focusable
                if (typeof elementToFocusOnClose.focus === 'function' && document.body.contains(elementToFocusOnClose)) {
                    elementToFocusOnClose.focus();
                } else {
                    taskInput?.focus(); // Fallback to main input
                }
            } catch (e) {
                console.warn("Could not restore focus:", e);
                taskInput?.focus();
            }
            elementToFocusOnClose = null;
        } else {
            taskInput?.focus(); // General fallback
        }
    }

    function confirmDeleteTask(id, isPermanent = false) {
        const taskToDelete = tasks.find(task => task.id === id);
        if (!taskToDelete) return;
        const safeText = sanitizeText(taskToDelete.text);
        elementToFocusOnClose = document.activeElement;

        const message = isPermanent
            ? `Permanently delete task "${safeText}"? This cannot be undone.`
            : `Delete task "${safeText}"?`; // Standard delete message

        showModal(message, () => {
            // For now, "Delete" always means permanent delete in this implementation
            deleteTask(id, true); // Pass true to permanently delete
        });
    }

    // Always performs permanent deletion in this version
    function deleteTask(id, isPermanent = true) { // Default to permanent
        const taskIndex = tasks.findIndex(task => task.id === id);
        if (taskIndex === -1) return;

        const taskElement = taskList?.querySelector(`li[data-id="${id}"]`);

        // Perform permanent deletion
        if (taskElement && !motionQuery.matches) {
            taskElement.classList.add('task-deleting');
            taskElement.addEventListener('transitionend', () => {
                 // Verify task still exists before removing from array (safety)
                 if (tasks.some(t => t.id === id)) {
                    tasks = tasks.filter(task => task.id !== id);
                    saveTasks();
                 }
            }, { once: true });
            // Fallback timeout
            setTimeout(() => {
                if (tasks.some(t => t.id === id)) {
                     console.warn("Fallback timeout removing deleted task:", id);
                     tasks = tasks.filter(task => task.id !== id);
                     saveTasks();
                }
             }, 500);
        } else {
            // No animation or element not found, remove immediately
            tasks = tasks.filter(task => task.id !== id);
            saveTasks();
        }
        // Focus restored via hideModal -> restoreFocusAfterModal
    }


    function confirmArchiveCompleted() {
        const completedCount = tasks.filter(task => task.completed && !task.isArchived).length;
        if (completedCount === 0) return;
        elementToFocusOnClose = document.activeElement;
        showModal(`Archive ${completedCount} completed task(s)?`, () => {
            archiveCompletedTasks();
        });
    }

    function archiveCompletedTasks() {
         const completedToArchive = tasks.filter(task => task.completed && !task.isArchived);
         if (completedToArchive.length === 0) return;

         if (!motionQuery.matches && taskList) { // Check if taskList exists
             let animationPromises = [];
             completedToArchive.forEach(task => {
                 const taskElement = taskList.querySelector(`li[data-id="${task.id}"]:not(.archived)`);
                 if (taskElement) {
                     taskElement.classList.add('task-deleting');
                     animationPromises.push(new Promise(resolve => {
                         taskElement.addEventListener('transitionend', resolve, { once: true });
                         setTimeout(resolve, 500);
                     }));
                  }
             });

             Promise.all(animationPromises).then(() => {
                 completedToArchive.forEach(task => task.isArchived = true);
                 saveTasks();
             }).catch(error => {
                  console.error("Error during archive animation:", error);
                  completedToArchive.forEach(task => task.isArchived = true); // Fallback
                  saveTasks();
             });
         } else {
              completedToArchive.forEach(task => task.isArchived = true);
              saveTasks();
         }
         // Focus restored via hideModal -> restoreFocusAfterModal
    }

     function unarchiveTask(id) {
         const taskIndex = tasks.findIndex(task => task.id === id && task.isArchived);
         if (taskIndex > -1) {
             tasks[taskIndex].isArchived = false;
             // Keep completed status as it was
             saveTasks();
         }
     }


    // --- UI Updates ---
    function updateArchiveButtonState(hasCompletedNonArchived) {
         if (archiveCompletedBtn) {
             archiveCompletedBtn.disabled = !hasCompletedNonArchived;
         }
    }

    function updateFilterButtons() {
        document.querySelectorAll('.filter-btn').forEach(button => {
             if (button.dataset.filter) { // Ensure button has filter data
                 button.classList.toggle('active', button.dataset.filter === currentFilter);
             }
        });
    }

    function changeFilter(filterValue) {
         // Cancel any active edits before changing filter
         if (editingTaskId) cancelEditMode(editingTaskId, false); // Don't trigger render yet
         if (editingSubtaskId) cancelSubtaskEditMode(null, editingSubtaskId, false); // Don't trigger render yet
         editingTaskId = null;
         editingSubtaskId = null;

        currentFilter = filterValue;
        renderApp(); // Now render with the new filter
    }

    function updateDraggability() {
        if (!taskList) return;
        const allowDrag = currentSort === 'manual' && currentFilter !== 'archived';
        taskList.querySelectorAll('.task-item').forEach(item => {
             const task = tasks.find(t => t.id === item.dataset.id);
             const canDrag = allowDrag && task && !task.isEditing && !task.completed && !task.isArchived;
             item.draggable = canDrag;
             const handle = item.querySelector('.drag-handle');
             if (handle) {
                 handle.style.display = canDrag ? '' : 'none';
             }
        });
    }

    // --- Drag and Drop ---
    function handleDragStart(e) {
         const taskItem = e.target.closest('.task-item');
         if (!taskItem || !taskItem.draggable || e.target.closest('.task-actions, .edit-controls, .subtask-item, input, textarea, button')) {
             e.preventDefault();
             return;
         }

        draggedItem = taskItem;
        e.dataTransfer.effectAllowed = 'move';
        try {
            e.dataTransfer.setData('text/plain', taskItem.dataset.id);
        } catch (err) {
            console.warn("Could not set drag data:", err); // IE fallback?
             e.dataTransfer.setData('Text', taskItem.dataset.id);
        }
        // Delay needed for visual feedback to apply correctly
        setTimeout(() => { if(draggedItem) draggedItem.classList.add('dragging'); }, 0);
    }

    function handleDragOver(e) {
        if (!draggedItem || currentSort !== 'manual' || currentFilter === 'archived') return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';

        const targetItem = e.target.closest('.task-item:not(.dragging):not(.completed):not(.archived)');
        const taskListElement = e.target.closest('#task-list');

        // Clear existing indicators first
        taskList.querySelectorAll('.drag-over-indicator-top, .drag-over-indicator-bottom').forEach(el => el.remove());

        if (targetItem && targetItem !== draggedItem) {
             const rect = targetItem.getBoundingClientRect();
             const halfway = rect.top + rect.height / 2;
             const indicatorClass = e.clientY < halfway ? 'drag-over-indicator-top' : 'drag-over-indicator-bottom';
             const indicator = document.createElement('div');
             indicator.className = indicatorClass;
             targetItem.appendChild(indicator);
        }
        // Optional: Indicator for dropping at the end of the list if hovering over empty space
        // else if (!targetItem && taskListElement) { ... }
    }

    function handleDragLeave(e) {
        // Remove indicator if leaving a valid target item
         const targetItem = e.target.closest('.task-item');
         const relatedTarget = e.relatedTarget ? e.relatedTarget.closest('.task-item') : null;
         // Only remove if moving outside the item or to another item
         if (targetItem && targetItem !== relatedTarget) {
             targetItem.querySelectorAll('.drag-over-indicator-top, .drag-over-indicator-bottom').forEach(el => el.remove());
         }
    }


    function handleDrop(e) {
        e.preventDefault();
        if (!draggedItem || currentSort !== 'manual' || currentFilter === 'archived') {
            if (draggedItem) draggedItem.classList.remove('dragging');
            taskList.querySelectorAll('.drag-over-indicator-top, .drag-over-indicator-bottom').forEach(el => el.remove());
            draggedItem = null;
            return;
        }

        const targetItemElement = e.target.closest('.task-item:not(.dragging):not(.completed):not(.archived)');
        let draggedId;
        try {
            draggedId = e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('Text');
        } catch (err) {
             console.error("Could not get drag data:", err);
             handleDragEnd(); // Clean up
             return;
        }


        // Clean up UI immediately
        draggedItem.classList.remove('dragging');
        taskList.querySelectorAll('.drag-over-indicator-top, .drag-over-indicator-bottom').forEach(el => el.remove());

        let targetId = null;
        let insertBefore = true;

        if (targetItemElement && targetItemElement.dataset.id !== draggedId) {
            targetId = targetItemElement.dataset.id;
            const rect = targetItemElement.getBoundingClientRect();
            const halfway = rect.top + rect.height / 2;
            insertBefore = (e.clientY < halfway);
        } else {
             // Dropped in empty space or on itself? Find last valid item to append after
             const validItems = Array.from(taskList.querySelectorAll('.task-item:not(.dragging):not(.completed):not(.archived)'));
             const lastValidItem = validItems.pop(); // Get last valid item visually
              if (lastValidItem && lastValidItem.dataset.id !== draggedId) {
                  targetId = lastValidItem.dataset.id;
                  insertBefore = false; // Append after the last valid item
              } else {
                  targetId = null; // No valid target, will use list bounds
                  insertBefore = true; // Default to prepend if list effectively empty
              }
        }

        // --- Reorder logic in the `tasks` array ---
        const draggedIndex = tasks.findIndex(task => task.id === draggedId);
        if (draggedIndex === -1) { console.error("Dragged task not found in array!", draggedId); draggedItem = null; return; }

        const [movedTask] = tasks.splice(draggedIndex, 1);

        let newIndex = -1;
        if (targetId === null) {
             // Append to the end of the non-archived/non-completed section
             const firstInvalidIndex = tasks.findIndex(t => t.completed || t.isArchived);
             newIndex = (firstInvalidIndex !== -1) ? firstInvalidIndex : tasks.length;
             if(insertBefore && newIndex === 0) newIndex = 0; // Prepend if list was totally empty
             else if(insertBefore) newIndex = 0; // Default prepend if no target ID
             // Basically, if no targetId, put it at the start unless insertBefore is false (meaning append to end of valid items)

        } else {
            const targetIndex = tasks.findIndex(task => task.id === targetId);
             if (targetIndex === -1) {
                 console.error("Target task not found after removal!", targetId);
                 tasks.splice(draggedIndex, 0, movedTask); // Put back roughly
                 draggedItem = null; return;
             }
             newIndex = insertBefore ? targetIndex : targetIndex + 1;
        }

        // Ensure index is within bounds
         newIndex = Math.max(0, Math.min(newIndex, tasks.length));

         // Prevent dropping into completed/archived section accidentally
         // Check the item before the target index
          if (newIndex > 0 && (tasks[newIndex - 1]?.completed || tasks[newIndex - 1]?.isArchived)) {
              // If item before is invalid, adjust index to be before it
              // This logic might need refinement based on exact desired behavior
              // For now, let's just ensure it stays within the 'active' block
              const firstInvalidIndex = tasks.findIndex(t => t.completed || t.isArchived);
               if (firstInvalidIndex !== -1) {
                    newIndex = Math.min(newIndex, firstInvalidIndex);
               }
          }

        tasks.splice(newIndex, 0, movedTask);

        if (currentSort !== 'manual') {
            currentSort = 'manual';
            if (sortSelect) sortSelect.value = 'manual';
        }
        saveTasks(); // Re-render with new order

        draggedItem = null;
    }

    function handleDragEnd(e) {
        // Clean up just in case drop didn't fire or was invalid
        if (draggedItem) {
            draggedItem.classList.remove('dragging');
        }
        taskList?.querySelectorAll('.drag-over-indicator-top, .drag-over-indicator-bottom').forEach(el => el.remove());
        draggedItem = null;
    }


    // --- Event Listeners ---
    if (taskForm) taskForm.addEventListener('submit', addTask);

    if (searchInput) {
        searchInput.addEventListener('input', debounce((e) => {
            currentSearchTerm = e.target.value;
            if (editingTaskId) cancelEditMode(editingTaskId, false); // Cancel edits on search
            if (editingSubtaskId) cancelSubtaskEditMode(null, editingSubtaskId, false);
            renderApp();
        }, 300));
    }

    if (sortSelect) {
        sortSelect.addEventListener('change', (e) => {
            if (editingTaskId) cancelEditMode(editingTaskId, false); // Cancel edits on sort change
            if (editingSubtaskId) cancelSubtaskEditMode(null, editingSubtaskId, false);
            currentSort = e.target.value;
            renderApp();
        });
    }

    if (filterButtonsContainer) {
         filterButtonsContainer.addEventListener('click', (event) => {
             const targetButton = event.target.closest('.filter-btn');
             if (targetButton && targetButton.dataset.filter && targetButton.dataset.filter !== currentFilter) {
                 changeFilter(targetButton.dataset.filter);
             }
         });
    }

    if (archiveCompletedBtn) archiveCompletedBtn.addEventListener('click', confirmArchiveCompleted);

    if (themeToggleBtn) themeToggleBtn.addEventListener('click', toggleTheme);

    // Modal Listeners
    if (confirmationModal) {
        modalConfirmBtn?.addEventListener('click', () => { if (modalConfirmCallback) modalConfirmCallback(); hideModal(); });
        modalCancelBtn?.addEventListener('click', hideModal);
        modalCloseBtn?.addEventListener('click', hideModal);
        confirmationModal.addEventListener('click', (event) => { if (event.target === confirmationModal) hideModal(); });
    }

    // Global Keyboard Listeners
    document.addEventListener('keydown', (event) => {
        // Escape key handling (prioritized)
        if (event.key === 'Escape') {
            if (confirmationModal?.getAttribute('aria-hidden') === 'false') {
                hideModal(); event.preventDefault();
            } else if (editingSubtaskId) {
                cancelSubtaskEditMode(null, editingSubtaskId, true); event.preventDefault();
            } else if (editingTaskId) {
                cancelEditMode(editingTaskId, true); event.preventDefault();
            }
            // Allow escape to bubble up (e.g., clear search input) if nothing else handled
            return; // Don't process shortcuts if escape was handled
        }

         // Other Shortcuts (only if not typing in inputs/textareas)
         const activeEl = document.activeElement;
         const isTyping = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');
         // Ignore if modifier keys are pressed (except shift sometimes?)
         if (isTyping || event.metaKey || event.ctrlKey || event.altKey) {
             return;
         }

         switch (event.key.toLowerCase()) {
            case 'n': // New Task
                taskInput?.focus();
                event.preventDefault();
                break;
            case 's': // Search
                searchInput?.focus();
                event.preventDefault();
                break;
            // Add more if needed...
         }
    });

    // Drag and Drop Listeners (Delegated to the list)
    if (taskList) {
        taskList.addEventListener('dragstart', handleDragStart);
        taskList.addEventListener('dragover', handleDragOver);
        taskList.addEventListener('dragleave', handleDragLeave);
        taskList.addEventListener('drop', handleDrop);
        taskList.addEventListener('dragend', handleDragEnd);
    } else {
         console.error("Task list element not found!");
    }

    // --- Initial Load ---
    loadTheme();
    loadTasks();

}); // End DOMContentLoaded
