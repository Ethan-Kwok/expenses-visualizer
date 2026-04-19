/**
 * Expense Visualization Tool - JavaScript
 */

// Global state
let expenseData = [];
let filteredData = [];
let activeCategories = new Set([
  'Necessities', 'Eating Out', 'Personal', 'Social', 
  'Gas', 'Subscriptions', 'Housing/Insurance', 'Adjective', 'Miscellaneous'
]);
let combineGraphs = false;
let vizType = 'running-average';
let runningAverageWindow = 7;
let priceRange = { min: 0, max: 1500 };
let dataMaxPrice = 10000; // Default max price in the dataset, used for slider limits

// Category color mapping
const categoryColors = {
  'Necessities': '#ef4444',
  'Eating Out': '#f59e0b',
  'Personal': '#10b981',
  'Social': '#3b82f6',
  'Gas': '#8b5cf6',
  'Subscriptions': '#ec4899',
  'Housing/Insurance': '#06b6d4',
  'Adjective': '#f97316',
  'Miscellaneous': '#64748b'
};

// DOM Elements
let csvInput, vizTypeSelect, averageSliderContainer, averageWindowSlider, averageWindowValue;
let categoryButtons, combineToggle, minPriceInput, maxPriceInput;
let minPriceSlider, maxPriceSlider, canvas, ctx;

// Initialize when DOM is ready
function init() {
  // Get DOM elements
  csvInput = document.getElementById('csv-input');
  vizTypeSelect = document.getElementById('viz-type');
  averageSliderContainer = document.getElementById('average-slider-container');
  averageWindowSlider = document.getElementById('average-window');
  averageWindowValue = document.getElementById('average-window-value');
  categoryButtons = document.querySelectorAll('.category-button');
  combineToggle = document.getElementById('combine-toggle');
  minPriceInput = document.getElementById('min-price');
  maxPriceInput = document.getElementById('max-price');
  minPriceSlider = document.getElementById('min-price-slider');
  maxPriceSlider = document.getElementById('max-price-slider');
  canvas = document.getElementById('expense-graph');
  ctx = canvas ? canvas.getContext('2d') : null;

  // loadDefaultData(); // removed for privacy
  setupEventListeners();
}

// Load default CSV data - removed for privacy
// async function loadDefaultData() {
//   try {
//     const response = await fetch('/data/expenses.csv');
//     const csvText = await response.text();
//     if (csvInput) {
//       csvInput.value = csvText;
//     }
//     parseCSV(csvText);
//     updateVisualization();
//   } catch (error) {
//     console.error('Error loading default data:', error);
//   }
// }

// Parse CSV data
function parseCSV(csvText) {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) {
    expenseData = [];
    return;
  }

  const headers = lines[0].split(',').map(h => h.trim());
  expenseData = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',');
    if (values.length === headers.length) {
      const expense = {};
      headers.forEach((header, index) => {
        expense[header] = values[index].trim();
      });
      
      // Convert price to number and date to Date object
      expense.price = parseFloat(expense.price);
      expense.date = new Date(expense.date);
      
      expenseData.push(expense);
    }
  }

  // Sort by date
  expenseData.sort((a, b) => a.date - b.date);
  
  // Update price range max based on data
  if (expenseData.length > 0) {
    const maxPrice = Math.max(...expenseData.map(e => e.price));
    const roundedMax = Math.ceil(maxPrice / 100) * 100;
    dataMaxPrice = roundedMax;
    priceRange.min = 0;
    priceRange.max = roundedMax;
    if (maxPriceInput) maxPriceInput.value = priceRange.max;
    if (maxPriceSlider) {
      maxPriceSlider.max = dataMaxPrice;
      maxPriceSlider.value = priceRange.max;
    }
    if (minPriceSlider) {
      minPriceSlider.max = dataMaxPrice;
      minPriceSlider.value = priceRange.min;
    }
  }
}

// Setup event listeners
function setupEventListeners() {
  // CSV input changes
  if (csvInput) {
    csvInput.addEventListener('input', (e) => {
      parseCSV(e.target.value);
      updateVisualization();
    });
  }

  // Visualization type changes
  if (vizTypeSelect) {
    vizTypeSelect.addEventListener('change', (e) => {
      vizType = e.target.value;
      if (averageSliderContainer) {
        averageSliderContainer.style.display = 
          vizType === 'running-average' ? 'flex' : 'none';
      }
      updateVisualization();
    });
  }

  // Running average window slider
  if (averageWindowSlider) {
    averageWindowSlider.addEventListener('input', (e) => {
      runningAverageWindow = parseInt(e.target.value);
      if (averageWindowValue) {
        averageWindowValue.textContent = runningAverageWindow;
      }
      updateVisualization();
    });
  }

  // Category filter buttons
  categoryButtons.forEach(button => {
    button.addEventListener('click', () => {
      const categoryText = button.textContent.trim();
      if (activeCategories.has(categoryText)) {
        activeCategories.delete(categoryText);
        button.classList.remove('active');
      } else {
        activeCategories.add(categoryText);
        button.classList.add('active');
      }
      updateVisualization();
    });
  });

  // Combine graphs toggle
  if (combineToggle) {
    combineToggle.addEventListener('click', () => {
      combineGraphs = !combineGraphs;
      combineToggle.classList.toggle('active');
      updateVisualization();
    });
  }

  // Price range inputs
  if (minPriceInput) {
    minPriceInput.addEventListener('input', (e) => {
      priceRange.min = parseFloat(e.target.value) || 0;
      if (minPriceSlider) minPriceSlider.value = priceRange.min;
      updateVisualization();
    });
  }

  if (maxPriceInput) {
    maxPriceInput.addEventListener('input', (e) => {
      priceRange.max = parseFloat(e.target.value) || 1500;
      if (maxPriceSlider) maxPriceSlider.value = priceRange.max;
      updateVisualization();
    });
  }

  if (minPriceSlider) {
    minPriceSlider.addEventListener('input', (e) => {
      priceRange.min = parseFloat(e.target.value);
      if (minPriceInput) minPriceInput.value = priceRange.min;
      updateVisualization();
    });
  }

  if (maxPriceSlider) {
    maxPriceSlider.addEventListener('input', (e) => {
      priceRange.max = parseFloat(e.target.value);
      if (maxPriceInput) maxPriceInput.value = priceRange.max;
      updateVisualization();
    });
  }

  // Handle window resize
  window.addEventListener('resize', () => {
    updateVisualization();
  });
}

// Filter data based on current settings
function filterData() {
  filteredData = expenseData.filter(expense => {
    // Filter by category
    if (!activeCategories.has(expense.category)) return false;
    
    // Filter by price range
    if (expense.price < priceRange.min || expense.price > priceRange.max) return false;
    
    return true;
  });
}

// Calculate visualization data
function calculateVisualizationData() {
  if (filteredData.length === 0) return null;

  if (combineGraphs) {
    // Combined view - sum all active categories
    return calculateSingleSeriesData(filteredData);
  } else {
    // Separate views - one series per category
    const seriesByCategory = {};
    activeCategories.forEach(category => {
      const categoryData = filteredData.filter(e => e.category === category);
      if (categoryData.length > 0) {
        seriesByCategory[category] = calculateSingleSeriesData(categoryData);
      }
    });
    return seriesByCategory;
  }
}

// Calculate data for a single series
function calculateSingleSeriesData(data) {
  if (data.length === 0) return [];

  switch (vizType) {
    case 'running-average':
      return calculateRunningAverage(data);
    case 'daily':
      return aggregateByDay(data);
    case 'weekly':
      return aggregateByWeek(data);
    case 'monthly':
      return aggregateByMonth(data);
    case 'running-total':
      return calculateRunningTotal(data);
    default:
      return [];
  }
}

// Calculate running average
function calculateRunningAverage(data) {
  const sorted = [...data].sort((a, b) => a.date - b.date);
  const result = [];
  
  for (let i = 0; i < sorted.length; i++) {
    const start = Math.max(0, i - runningAverageWindow + 1);
    const window = sorted.slice(start, i + 1);
    const avg = window.reduce((sum, e) => sum + e.price, 0) / window.length;
    
    result.push({
      date: sorted[i].date,
      value: avg
    });
  }
  
  return result;
}

// Aggregate by day
function aggregateByDay(data) {
  const byDay = {};
  
  data.forEach(expense => {
    const dateKey = expense.date.toISOString().split('T')[0];
    if (!byDay[dateKey]) {
      byDay[dateKey] = { date: expense.date, value: 0 };
    }
    byDay[dateKey].value += expense.price;
  });
  
  return Object.values(byDay).sort((a, b) => a.date - b.date);
}

// Aggregate by week
function aggregateByWeek(data) {
  const byWeek = {};
  
  data.forEach(expense => {
    const weekStart = getWeekStart(expense.date);
    const weekKey = weekStart.toISOString().split('T')[0];
    if (!byWeek[weekKey]) {
      byWeek[weekKey] = { date: weekStart, value: 0 };
    }
    byWeek[weekKey].value += expense.price;
  });
  
  return Object.values(byWeek).sort((a, b) => a.date - b.date);
}

// Aggregate by month
function aggregateByMonth(data) {
  const byMonth = {};
  
  data.forEach(expense => {
    const monthStart = new Date(expense.date.getFullYear(), expense.date.getMonth(), 1);
    const monthKey = `${monthStart.getFullYear()}-${monthStart.getMonth()}`;
    if (!byMonth[monthKey]) {
      byMonth[monthKey] = { date: monthStart, value: 0 };
    }
    byMonth[monthKey].value += expense.price;
  });
  
  return Object.values(byMonth).sort((a, b) => a.date - b.date);
}

// Calculate running total
function calculateRunningTotal(data) {
  const sorted = [...data].sort((a, b) => a.date - b.date);
  let total = 0;
  
  return sorted.map(expense => {
    total += expense.price;
    return {
      date: expense.date,
      value: total
    };
  });
}

// Helper: Get start of week (Sunday)
function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day;
  return new Date(d.setDate(diff));
}

// Update the graph visualization
function updateVisualization() {
  filterData();
  const vizData = calculateVisualizationData();
  renderGraph(vizData);
}

// Render the graph on canvas
function renderGraph(vizData) {
  if (!ctx || !canvas) return;

  // Set canvas size
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const width = rect.width;
  const height = rect.height;

  // Clear canvas
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  if (!vizData || (typeof vizData === 'object' && Object.keys(vizData).length === 0) || 
      (Array.isArray(vizData) && vizData.length === 0)) {
    // Show empty state
    ctx.fillStyle = '#6b7280';
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No data to display', width / 2, height / 2);
    return;
  }

  // Define margins
  const margin = { top: 30, right: 30, bottom: 50, left: 70 };
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;

  // Get all data points and determine scales
  let allPoints = [];
  let seriesArray = [];

  if (combineGraphs) {
    seriesArray = [{ name: 'Total', data: vizData, color: '#4f46e5' }];
  } else {
    seriesArray = Object.entries(vizData).map(([category, data]) => ({
      name: category,
      data: data,
      color: categoryColors[category] || '#64748b'
    }));
  }

  seriesArray.forEach(series => {
    allPoints = allPoints.concat(series.data);
  });

  if (allPoints.length === 0) return;

  // Calculate scales
  const dates = allPoints.map(p => p.date.getTime());
  const values = allPoints.map(p => p.value);
  const minDate = Math.min(...dates);
  const maxDate = Math.max(...dates);
  const minValue = 0; // Always start from 0
  const maxValue = Math.max(...values) * 1.1; // Add 10% padding

  // Scale functions
  const scaleX = (date) => {
    return margin.left + ((date.getTime() - minDate) / (maxDate - minDate)) * chartWidth;
  };

  const scaleY = (value) => {
    return margin.top + chartHeight - ((value - minValue) / (maxValue - minValue)) * chartHeight;
  };

  // Draw axes
  ctx.strokeStyle = '#e5e7eb';
  ctx.lineWidth = 1;

  // Y-axis
  ctx.beginPath();
  ctx.moveTo(margin.left, margin.top);
  ctx.lineTo(margin.left, height - margin.bottom);
  ctx.stroke();

  // X-axis
  ctx.beginPath();
  ctx.moveTo(margin.left, height - margin.bottom);
  ctx.lineTo(width - margin.right, height - margin.bottom);
  ctx.stroke();

  // Draw Y-axis labels and grid lines
  ctx.fillStyle = '#6b7280';
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'right';
  const yTicks = 5;
  for (let i = 0; i <= yTicks; i++) {
    const value = minValue + (maxValue - minValue) * (i / yTicks);
    const y = scaleY(value);
    
    // Grid line
    ctx.strokeStyle = '#f3f4f6';
    ctx.beginPath();
    ctx.moveTo(margin.left, y);
    ctx.lineTo(width - margin.right, y);
    ctx.stroke();
    
    // Label
    ctx.fillText('$' + value.toFixed(0), margin.left - 10, y + 4);
  }

  // Draw X-axis labels
  ctx.textAlign = 'center';
  const xTicks = Math.min(6, allPoints.length);
  for (let i = 0; i <= xTicks; i++) {
    const timestamp = minDate + (maxDate - minDate) * (i / xTicks);
    const date = new Date(timestamp);
    const x = scaleX(date);
    
    const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    ctx.fillText(dateStr, x, height - margin.bottom + 20);
  }

  // Draw data series
  seriesArray.forEach(series => {
    if (series.data.length === 0) return;

    ctx.strokeStyle = series.color;
    ctx.lineWidth = 2;
    ctx.beginPath();

    series.data.forEach((point, index) => {
      const x = scaleX(point.date);
      const y = scaleY(point.value);

      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });

    ctx.stroke();

    // Draw points
    ctx.fillStyle = series.color;
    series.data.forEach(point => {
      const x = scaleX(point.date);
      const y = scaleY(point.value);
      
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    });
  });

  // Draw legend if multiple series
  if (seriesArray.length > 1) {
    let legendX = margin.left;
    const legendY = 15;
    
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'left';
    
    seriesArray.forEach(series => {
      // Color box
      ctx.fillStyle = series.color;
      ctx.fillRect(legendX, legendY - 8, 12, 12);
      
      // Label
      ctx.fillStyle = '#111827';
      const labelWidth = ctx.measureText(series.name).width;
      ctx.fillText(series.name, legendX + 16, legendY + 2);
      
      legendX += 16 + labelWidth + 20;
    });
  }
}

// Initialize on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
