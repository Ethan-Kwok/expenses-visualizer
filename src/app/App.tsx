import "../styles/expense-viz.css";
import { useEffect, useRef, useState } from "react";

// Category color mapping
const categoryColors: Record<string, string> = {
  Necessities: "#ef4444",
  "Eating Out": "#f59e0b",
  Personal: "#10b981",
  Social: "#3b82f6",
  Gas: "#8b5cf6",
  Subscriptions: "#ec4899",
  "Housing/Insurance": "#06b6d4",
  Adjective: "#f97316",
  Miscellaneous: "#64748b",
};

interface Expense {
  price: number;
  category: string;
  item: string;
  date: Date;
}

interface DataPoint {
  date: Date;
  value: number;
  items?: { item: string; price: number }[]; // Track items and their prices for tooltip display
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const vizDataRef = useRef<any>(null);
  const [expenseData, setExpenseData] = useState<Expense[]>([]);
  const [activeCategories, setActiveCategories] = useState(
    new Set([
      "Necessities",
      "Eating Out",
      "Personal",
      "Social",
      "Gas",
      "Subscriptions",
      "Housing/Insurance",
      "Adjective",
      "Miscellaneous",
    ]),
  );
  const [combineGraphs, setCombineGraphs] = useState(false);
  const [vizType, setVizType] = useState("running-average");
  const [runningAverageWindow, setRunningAverageWindow] =
    useState(7);
  const [dataMaxPrice, setDataMaxPrice] = useState(10000);
  const [priceRange, setPriceRange] = useState({
    min: 0 as number | "",
    max: dataMaxPrice as number | "",
  });
  const [csvText, setCsvText] = useState("");
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    items: { item: string; price: number }[];
  } | null>(null);
  const [dateRange, setDateRange] = useState<{
    min: number | null;
    max: number | null;
  }>({ min: null, max: null });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{
    x: number;
    dateMin: number;
    dateMax: number;
  } | null>(null);

  // Load default CSV data - removed for privacy
  // useEffect(() => {
  //   fetch("/data/expenses.csv")
  //     .then((response) => response.text())
  //     .then((text) => {
  //       setCsvText(text);
  //       parseCSV(text);
  //     })
  //     .catch((error) =>
  //       console.error("Error loading default data:", error),
  //     );
  // }, []);

  // Parse CSV data
  const parseCSV = (csvText: string) => {
    const lines = csvText.trim().split("\n");
    if (lines.length < 2) {
      setExpenseData([]);
      return;
    }

    const headers = lines[0].split(",").map((h) => h.trim());
    const expenses: Expense[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(",");
      if (values.length === headers.length) {
        const expense: any = {};
        headers.forEach((header, index) => {
          expense[header] = values[index].trim();
        });

        expense.price = parseFloat(expense.price);
        expense.date = new Date(expense.date);

        expenses.push(expense as Expense);
      }
    }

    expenses.sort(
      (a, b) => a.date.getTime() - b.date.getTime(),
    );
    setExpenseData(expenses);

    // Update price range max based on data
    if (expenses.length > 0) {
      const maxPrice = Math.max(
        ...expenses.map((e) => e.price),
      );
      const roundedMax = Math.ceil(maxPrice / 100) * 100;
      setDataMaxPrice(roundedMax);
      setPriceRange((prev) => {
        const min = typeof prev.min === "number" ? prev.min : 0;
        const max =
          typeof prev.max === "number" ? prev.max : roundedMax;

        const clampedMin = Math.max(
          0,
          Math.min(min, roundedMax),
        );
        const clampedMax = Math.max(
          clampedMin,
          Math.min(max, roundedMax),
        );

        return { ...prev, min: clampedMin, max: clampedMax };
      });
    }
  };

  // Filter and calculate visualization
  useEffect(() => {
    if (!canvasRef.current) return;

    const filteredData = expenseData.filter((expense) => {
      if (!activeCategories.has(expense.category)) return false;
      const min =
        typeof priceRange.min === "number" ? priceRange.min : 0;
      const max =
        typeof priceRange.max === "number"
          ? priceRange.max
          : dataMaxPrice;
      if (expense.price < min || expense.price > max)
        return false;
      return true;
    });

    const vizData = calculateVisualizationData(filteredData);
    vizDataRef.current = vizData;

    // Initialize date range if needed
    if (dateRange.min === null || dateRange.max === null) {
      let allPoints: DataPoint[] = [];
      if (vizData) {
        if (Array.isArray(vizData)) {
          allPoints = vizData;
        } else {
          Object.values(vizData).forEach((series: any) => {
            allPoints = allPoints.concat(series);
          });
        }
      }
      if (allPoints.length > 0) {
        const dates = allPoints.map((p) => p.date.getTime());
        setDateRange({
          min: Math.min(...dates),
          max: Math.max(...dates),
        });
      }
    }

    renderGraph(vizData, filteredData);
  }, [
    expenseData,
    activeCategories,
    combineGraphs,
    vizType,
    runningAverageWindow,
    priceRange,
    dateRange,
  ]);

  // Calculate visualization data
  const calculateVisualizationData = (
    filteredData: Expense[],
  ) => {
    if (filteredData.length === 0) return null;

    if (combineGraphs) {
      return calculateSingleSeriesData(filteredData);
    } else {
      const seriesByCategory: Record<string, DataPoint[]> = {};
      activeCategories.forEach((category) => {
        const categoryData = filteredData.filter(
          (e) => e.category === category,
        );
        if (categoryData.length > 0) {
          seriesByCategory[category] =
            calculateSingleSeriesData(categoryData);
        }
      });
      return seriesByCategory;
    }
  };

  // Calculate data for a single series
  const calculateSingleSeriesData = (
    data: Expense[],
  ): DataPoint[] => {
    if (data.length === 0) return [];

    switch (vizType) {
      case "running-average":
        return calculateRunningAverage(data);
      case "daily":
        return aggregateByDay(data);
      case "weekly":
        return aggregateByWeek(data);
      case "monthly":
        return aggregateByMonth(data);
      case "running-total":
        return calculateRunningTotal(data);
      default:
        return [];
    }
  };

  const calculateRunningAverage = (
    data: Expense[],
  ): DataPoint[] => {
    const sorted = [...data].sort(
      (a, b) => a.date.getTime() - b.date.getTime(),
    );
    const result: DataPoint[] = [];

    for (let i = 0; i < sorted.length; i++) {
      const start = Math.max(0, i - runningAverageWindow + 1);
      const window = sorted.slice(start, i + 1);
      const avg =
        window.reduce((sum, e) => sum + e.price, 0) /
        window.length;

      result.push({
        date: sorted[i].date,
        value: avg,
        items: window.map((e) => ({
          item: e.item,
          price: e.price,
        })),
      });
    }

    return result;
  };

  const aggregateByDay = (data: Expense[]): DataPoint[] => {
    const byDay: Record<string, DataPoint> = {};

    data.forEach((expense) => {
      const dateKey = expense.date.toISOString().split("T")[0];
      if (!byDay[dateKey]) {
        byDay[dateKey] = {
          date: expense.date,
          value: 0,
          items: [],
        };
      }
      byDay[dateKey].value += expense.price;
      byDay[dateKey].items?.push({
        item: expense.item,
        price: expense.price,
      });
    });

    return Object.values(byDay).sort(
      (a, b) => a.date.getTime() - b.date.getTime(),
    );
  };

  const aggregateByWeek = (data: Expense[]): DataPoint[] => {
    const byWeek: Record<string, DataPoint> = {};

    data.forEach((expense) => {
      const weekStart = getWeekStart(expense.date);
      const weekKey = weekStart.toISOString().split("T")[0];
      if (!byWeek[weekKey]) {
        byWeek[weekKey] = {
          date: weekStart,
          value: 0,
          items: [],
        };
      }
      byWeek[weekKey].value += expense.price;
      byWeek[weekKey].items?.push({
        item: expense.item,
        price: expense.price,
      });
    });

    return Object.values(byWeek).sort(
      (a, b) => a.date.getTime() - b.date.getTime(),
    );
  };

  const aggregateByMonth = (data: Expense[]): DataPoint[] => {
    const byMonth: Record<string, DataPoint> = {};

    data.forEach((expense) => {
      const monthStart = new Date(
        expense.date.getFullYear(),
        expense.date.getMonth(),
        1,
      );
      const monthKey = `${monthStart.getFullYear()}-${monthStart.getMonth()}`;
      if (!byMonth[monthKey]) {
        byMonth[monthKey] = {
          date: monthStart,
          value: 0,
          items: [],
        };
      }
      byMonth[monthKey].value += expense.price;
      byMonth[monthKey].items?.push({
        item: expense.item,
        price: expense.price,
      });
    });

    return Object.values(byMonth).sort(
      (a, b) => a.date.getTime() - b.date.getTime(),
    );
  };

  const calculateRunningTotal = (
    data: Expense[],
  ): DataPoint[] => {
    const sorted = [...data].sort(
      (a, b) => a.date.getTime() - b.date.getTime(),
    );
    let total = 0;

    return sorted.map((expense) => {
      total += expense.price;
      return {
        date: expense.date,
        value: total,
        items: [{ item: expense.item, price: expense.price }],
      };
    });
  };

  const getWeekStart = (date: Date): Date => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day;
    return new Date(d.setDate(diff));
  };

  // Render graph
  const renderGraph = (
    vizData: any,
    filteredData: Expense[],
  ) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    if (
      !vizData ||
      (typeof vizData === "object" &&
        Object.keys(vizData).length === 0) ||
      (Array.isArray(vizData) && vizData.length === 0)
    ) {
      ctx.fillStyle = "#6b7280";
      ctx.font = "16px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("No data to display", width / 2, height / 2);
      return;
    }

    const margin = { top: 30, right: 30, bottom: 50, left: 70 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    let allPoints: DataPoint[] = [];
    let seriesArray: Array<{
      name: string;
      data: DataPoint[];
      color: string;
    }> = [];

    if (combineGraphs) {
      seriesArray = [
        { name: "Total", data: vizData, color: "#4f46e5" },
      ];
    } else {
      seriesArray = Object.entries(vizData).map(
        ([category, data]) => ({
          name: category,
          data: data as DataPoint[],
          color: categoryColors[category] || "#64748b",
        }),
      );
    }

    seriesArray.forEach((series) => {
      allPoints = allPoints.concat(series.data);
    });

    if (allPoints.length === 0) return;

    const values = allPoints.map((p) => p.value);
    const minDate = dateRange.min || 0;
    const maxDate = dateRange.max || Date.now();
    const minValue = 0;
    const maxValue = Math.max(...values) * 1.1;

    const scaleX = (date: Date) => {
      return (
        margin.left +
        ((date.getTime() - minDate) / (maxDate - minDate)) *
          chartWidth
      );
    };

    const scaleY = (value: number) => {
      return (
        margin.top +
        chartHeight -
        ((value - minValue) / (maxValue - minValue)) *
          chartHeight
      );
    };

    // Draw axes
    ctx.strokeStyle = "#e5e7eb";
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.moveTo(margin.left, margin.top);
    ctx.lineTo(margin.left, height - margin.bottom);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(margin.left, height - margin.bottom);
    ctx.lineTo(width - margin.right, height - margin.bottom);
    ctx.stroke();

    // Y-axis labels
    ctx.fillStyle = "#6b7280";
    ctx.font = "12px sans-serif";
    ctx.textAlign = "right";
    const yTicks = 5;
    for (let i = 0; i <= yTicks; i++) {
      const value =
        minValue + (maxValue - minValue) * (i / yTicks);
      const y = scaleY(value);

      ctx.strokeStyle = "#f3f4f6";
      ctx.beginPath();
      ctx.moveTo(margin.left, y);
      ctx.lineTo(width - margin.right, y);
      ctx.stroke();

      ctx.fillStyle = "#6b7280";
      ctx.fillText(
        "$" + value.toFixed(0),
        margin.left - 10,
        y + 4,
      );
    }

    // X-axis labels
    ctx.textAlign = "center";
    const xTicks = Math.min(6, allPoints.length);
    for (let i = 0; i <= xTicks; i++) {
      const timestamp =
        minDate + (maxDate - minDate) * (i / xTicks);
      const date = new Date(timestamp);
      const x = scaleX(date);

      const dateStr = date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
      ctx.fillStyle = "#6b7280";
      ctx.fillText(dateStr, x, height - margin.bottom + 20);
    }

    // Set up clipping region for graph area
    ctx.save();
    ctx.beginPath();
    ctx.rect(margin.left, margin.top, chartWidth, chartHeight);
    ctx.clip();

    // Draw series
    seriesArray.forEach((series) => {
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

      ctx.fillStyle = series.color;
      series.data.forEach((point) => {
        const x = scaleX(point.date);
        const y = scaleY(point.value);

        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
      });
    });

    // Restore context (remove clipping)
    ctx.restore();

    // Legend
    if (seriesArray.length > 1) {
      let legendX = margin.left;
      const legendY = 15;

      ctx.font = "12px sans-serif";
      ctx.textAlign = "left";

      seriesArray.forEach((series) => {
        ctx.fillStyle = series.color;
        ctx.fillRect(legendX, legendY - 8, 12, 12);

        ctx.fillStyle = "#111827";
        const labelWidth = ctx.measureText(series.name).width;
        ctx.fillText(series.name, legendX + 16, legendY + 2);

        legendX += 16 + labelWidth + 20;
      });
    }
  };

  const toggleCategory = (category: string) => {
    setActiveCategories((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(category)) {
        newSet.delete(category);
      } else {
        newSet.add(category);
      }
      return newSet;
    });
  };

  const handleCanvasMouseMove = (
    e: React.MouseEvent<HTMLCanvasElement>,
  ) => {
    const canvas = canvasRef.current;
    if (
      !canvas ||
      !vizDataRef.current ||
      dateRange.min === null ||
      dateRange.max === null
    ) {
      setTooltip(null);
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const width = rect.width;
    const height = rect.height;
    const margin = { top: 30, right: 30, bottom: 50, left: 70 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    const vizData = vizDataRef.current;
    let seriesArray: Array<{
      name: string;
      data: DataPoint[];
      color: string;
    }> = [];

    if (combineGraphs && Array.isArray(vizData)) {
      seriesArray = [
        { name: "Total", data: vizData, color: "#4f46e5" },
      ];
    } else if (typeof vizData === "object") {
      seriesArray = Object.entries(vizData).map(
        ([category, data]) => ({
          name: category,
          data: data as DataPoint[],
          color: categoryColors[category] || "#64748b",
        }),
      );
    }

    let allPoints: DataPoint[] = [];
    seriesArray.forEach((series) => {
      allPoints = allPoints.concat(series.data);
    });

    if (allPoints.length === 0) {
      setTooltip(null);
      return;
    }

    const values = allPoints.map((p) => p.value);
    const minDate = dateRange.min;
    const maxDate = dateRange.max;
    const minValue = 0;
    const maxValue = Math.max(...values) * 1.1;

    const scaleX = (date: Date) => {
      return (
        margin.left +
        ((date.getTime() - minDate) / (maxDate - minDate)) *
          chartWidth
      );
    };

    const scaleY = (value: number) => {
      return (
        margin.top +
        chartHeight -
        ((value - minValue) / (maxValue - minValue)) *
          chartHeight
      );
    };

    // Find closest point
    const hoverRadius = 10;
    let closestPoint: DataPoint | null = null;
    let minDistance = hoverRadius;

    allPoints.forEach((point) => {
      const x = scaleX(point.date);
      const y = scaleY(point.value);
      const distance = Math.sqrt(
        Math.pow(mouseX - x, 2) + Math.pow(mouseY - y, 2),
      );

      if (distance < minDistance) {
        minDistance = distance;
        closestPoint = point;
      }
    });

    if (
      closestPoint &&
      closestPoint.items &&
      closestPoint.items.length > 0
    ) {
      setTooltip({
        x: e.clientX,
        y: e.clientY,
        items: closestPoint.items,
      });
    } else {
      setTooltip(null);
    }
  };

  const handleCanvasMouseLeave = () => {
    setTooltip(null);
  };

  // Add wheel event listener with passive: false
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (dateRange.min === null || dateRange.max === null)
        return;

      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const width = rect.width;
      const margin = { left: 70, right: 30 };
      const chartWidth = width - margin.left - margin.right;

      // Calculate mouse position as percentage of chart
      const mousePercent = (mouseX - margin.left) / chartWidth;
      const clampedPercent = Math.max(
        0,
        Math.min(1, mousePercent),
      );

      // Zoom factor
      const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;
      const currentRange = dateRange.max - dateRange.min;
      const newRange = currentRange * zoomFactor;

      // Calculate new min/max based on mouse position
      const mouseTime =
        dateRange.min + currentRange * clampedPercent;
      const newMin = mouseTime - newRange * clampedPercent;
      const newMax =
        mouseTime + newRange * (1 - clampedPercent);

      setDateRange({ min: newMin, max: newMax });
    };

    canvas.addEventListener("wheel", handleWheel, {
      passive: false,
    });

    return () => {
      canvas.removeEventListener("wheel", handleWheel);
    };
  }, [dateRange]);

  // Add touch event listeners with passive: false for mobile zoom
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let lastDist: number | null = null;
    let lastCenterX: number | null = null;

    const handleTouchStartNative = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();

        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        lastDist = Math.hypot(
          touch2.clientX - touch1.clientX,
          touch2.clientY - touch1.clientY,
        );
        lastCenterX = (touch1.clientX + touch2.clientX) / 2;
      } else if (e.touches.length === 1) {
        // Single touch for panning
        if (dateRange.min === null || dateRange.max === null) return;

        panStartRef.current = {
          x: e.touches[0].clientX,
          dateMin: dateRange.min,
          dateMax: dateRange.max,
        };
      }
    };

    const handleTouchMoveNative = (e: TouchEvent) => {
      if (e.touches.length === 2 && lastDist !== null && lastCenterX !== null) {
        e.preventDefault();
        if (dateRange.min === null || dateRange.max === null) return;

        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        const currentDist = Math.hypot(
          touch2.clientX - touch1.clientX,
          touch2.clientY - touch1.clientY,
        );
        const currentCenterX = (touch1.clientX + touch2.clientX) / 2;

        // Calculate zoom based on distance change from last frame
        const scale = lastDist / currentDist;
        const currentRange = dateRange.max - dateRange.min;
        const newRange = currentRange * scale;

        // Calculate pan based on center movement from last frame
        const rect = canvas.getBoundingClientRect();
        const width = rect.width;
        const margin = { left: 70, right: 30 };
        const chartWidth = width - margin.left - margin.right;
        const centerDelta = currentCenterX - lastCenterX;
        const dateDelta = -(centerDelta / chartWidth) * newRange;

        const center = (dateRange.min + dateRange.max) / 2;
        setDateRange({
          min: center - newRange / 2 + dateDelta,
          max: center + newRange / 2 + dateDelta,
        });

        // Update for next frame
        lastDist = currentDist;
        lastCenterX = currentCenterX;
      } else if (e.touches.length === 1 && panStartRef.current) {
        e.preventDefault();

        const rect = canvas.getBoundingClientRect();
        const width = rect.width;
        const margin = { left: 70, right: 30 };
        const chartWidth = width - margin.left - margin.right;

        const deltaX = e.touches[0].clientX - panStartRef.current.x;
        const dateRange = panStartRef.current.dateMax - panStartRef.current.dateMin;
        const deltaTime = -(deltaX / chartWidth) * dateRange;

        setDateRange({
          min: panStartRef.current.dateMin + deltaTime,
          max: panStartRef.current.dateMax + deltaTime,
        });
      }
    };

    const handleTouchEndNative = () => {
      lastDist = null;
      lastCenterX = null;
      panStartRef.current = null;
    };

    canvas.addEventListener('touchstart', handleTouchStartNative, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMoveNative, { passive: false });
    canvas.addEventListener('touchend', handleTouchEndNative);
    canvas.addEventListener('touchcancel', handleTouchEndNative);

    return () => {
      canvas.removeEventListener('touchstart', handleTouchStartNative);
      canvas.removeEventListener('touchmove', handleTouchMoveNative);
      canvas.removeEventListener('touchend', handleTouchEndNative);
      canvas.removeEventListener('touchcancel', handleTouchEndNative);
    };
  }, [dateRange]);

  const handleMouseDown = (
    e: React.MouseEvent<HTMLCanvasElement>,
  ) => {
    if (dateRange.min === null || dateRange.max === null)
      return;
    setIsPanning(true);
    panStartRef.current = {
      x: e.clientX,
      dateMin: dateRange.min,
      dateMax: dateRange.max,
    };
  };

  const handleMouseMove = (
    e: React.MouseEvent<HTMLCanvasElement>,
  ) => {
    if (isPanning && panStartRef.current) {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const width = rect.width;
      const margin = { left: 70, right: 30 };
      const chartWidth = width - margin.left - margin.right;

      const deltaX = e.clientX - panStartRef.current.x;
      const dateRange =
        panStartRef.current.dateMax -
        panStartRef.current.dateMin;
      const deltaTime = -(deltaX / chartWidth) * dateRange;

      setDateRange({
        min: panStartRef.current.dateMin + deltaTime,
        max: panStartRef.current.dateMax + deltaTime,
      });
    } else {
      handleCanvasMouseMove(e);
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
    panStartRef.current = null;
  };

  const resetZoom = () => {
    if (!vizDataRef.current) return;

    let allPoints: DataPoint[] = [];
    const vizData = vizDataRef.current;

    if (Array.isArray(vizData)) {
      allPoints = vizData;
    } else if (typeof vizData === "object") {
      Object.values(vizData).forEach((series: any) => {
        allPoints = allPoints.concat(series);
      });
    }

    if (allPoints.length > 0) {
      const dates = allPoints.map((p) => p.date.getTime());
      setDateRange({
        min: Math.min(...dates),
        max: Math.max(...dates),
      });
    }
  };

  const minVal =
    typeof priceRange.min === "number" ? priceRange.min : 0;
  const maxVal =
    typeof priceRange.max === "number"
      ? priceRange.max
      : dataMaxPrice;
  const safeMax = dataMaxPrice || 1;

  const minPercent = (minVal / safeMax) * 100;
  const maxPercent = (maxVal / safeMax) * 100;

  return (
    <div className="expense-viz-container">
      <header className="page-header">
        <h1 className="page-title">
          Expense Visualization Tool
        </h1>
        <p className="page-subtitle">
          Upload and analyze your spending patterns with
          interactive charts
        </p>
      </header>

      <div className="control-panel">
        <div className="control-section">
          <label className="section-label" htmlFor="csv-input">
            CSV Data Input
          </label>
          <textarea
            id="csv-input"
            className="csv-textarea"
            placeholder="Paste your CSV data here (price, category, item, date)..."
            value={csvText}
            onChange={(e) => {
              setCsvText(e.target.value);
              parseCSV(e.target.value);
            }}
          />
        </div>

        <div className="control-section">
          <label className="section-label" htmlFor="viz-type">
            Visualization Type
          </label>
          <div className="viz-type-row">
            <select
              id="viz-type"
              className="viz-select"
              value={vizType}
              onChange={(e) => setVizType(e.target.value)}
            >
              <option value="running-average">
                Running Average
              </option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="running-total">
                Running Total
              </option>
            </select>

            <div
              className="slider-container"
              id="average-slider-container"
              style={{
                display:
                  vizType === "running-average"
                    ? "flex"
                    : "none",
              }}
            >
              <label
                className="slider-label"
                htmlFor="average-window"
              >
                Window Size:
              </label>
              <input
                type="range"
                id="average-window"
                className="slider-input"
                min="1"
                max="30"
                value={runningAverageWindow}
                onChange={(e) =>
                  setRunningAverageWindow(
                    parseInt(e.target.value),
                  )
                }
              />
              <span
                className="slider-value"
                id="average-window-value"
              >
                {runningAverageWindow}
              </span>
            </div>
          </div>
        </div>

        <div className="control-section">
          <span className="section-label">
            Category Filters
          </span>
          <div className="category-filters">
            {[
              "Necessities",
              "Eating Out",
              "Personal",
              "Social",
              "Gas",
              "Subscriptions",
              "Housing/Insurance",
              "Adjective",
              "Miscellaneous",
            ].map((category) => (
              <button
                key={category}
                className={`category-button ${category.toLowerCase().replace("/", "").replace(" ", "-")} ${activeCategories.has(category) ? "active" : ""}`}
                onClick={() => toggleCategory(category)}
              >
                <span className="category-color-dot"></span>
                {category}
              </button>
            ))}
          </div>
        </div>

        <div className="control-section">
          <span className="section-label">Display Mode</span>
          <div className="combine-toggle-container">
            <button
              className={`toggle-button ${combineGraphs ? "active" : ""}`}
              onClick={() => setCombineGraphs(!combineGraphs)}
            >
              Combine Graphs
            </button>
          </div>
        </div>

        <div className="control-section">
          <span className="section-label">
            Price Range Filter
          </span>
          <div className="price-range-container">
            <div className="range-inputs">
              <div className="range-input-group">
                <label
                  className="range-input-label"
                  htmlFor="min-price"
                >
                  Min:
                </label>
                <input
                  type="number"
                  id="min-price"
                  className="range-number-input"
                  placeholder="0"
                  min="0"
                  step="1"
                  value={priceRange.min}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (raw === "") {
                      setPriceRange((prev) => ({
                        ...prev,
                        min: "",
                      }));
                      return;
                    }
                    const val = Number(raw);
                    setPriceRange((prev) => {
                      const max =
                        typeof prev.max === "number"
                          ? prev.max
                          : dataMaxPrice;
                      const clamped = Math.min(
                        Math.max(0, val),
                        dataMaxPrice,
                      );
                      return {
                        ...prev,
                        min: clamped > max ? max : clamped,
                      };
                    });
                  }}
                />
              </div>
              <div className="range-input-group">
                <label
                  className="range-input-label"
                  htmlFor="max-price"
                >
                  Max:
                </label>
                <input
                  type="number"
                  id="max-price"
                  className="range-number-input"
                  placeholder="10000"
                  min="0"
                  step="1"
                  value={priceRange.max}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (raw === "") {
                      setPriceRange((prev) => ({
                        ...prev,
                        max: "",
                      }));
                      return;
                    }
                    const val = Number(raw);
                    setPriceRange((prev) => {
                      const min =
                        typeof prev.min === "number"
                          ? prev.min
                          : 0;
                      const clamped = Math.min(
                        Math.max(0, val),
                        dataMaxPrice,
                      );
                      return {
                        ...prev,
                        max: clamped < min ? min : clamped,
                      };
                    });
                  }}
                />
              </div>
            </div>
            <div className="dual-slider-container">
              <div className="slider-track"></div>
              <div
                className="slider-range"
                style={{
                  left: `${minPercent}%`,
                  width: `${Math.max(0, maxPercent - minPercent)}%`,
                }}
              ></div>
              <input
                type="range"
                id="min-price-slider"
                className="slider-input"
                min="0"
                max={dataMaxPrice}
                value={
                  typeof priceRange.min === "number"
                    ? priceRange.min
                    : 0
                }
                step="1"
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setPriceRange((prev) => {
                    const max =
                      typeof prev.max === "number"
                        ? prev.max
                        : dataMaxPrice;
                    const clamped = Math.min(
                      Math.max(0, val),
                      dataMaxPrice,
                    );
                    return {
                      ...prev,
                      min: clamped > max ? max : clamped,
                    };
                  });
                }}
              />
              <input
                type="range"
                id="max-price-slider"
                className="slider-input"
                min="0"
                max={dataMaxPrice}
                value={
                  typeof priceRange.max === "number"
                    ? priceRange.max
                    : dataMaxPrice
                }
                step="1"
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setPriceRange((prev) => {
                    const min =
                      typeof prev.min === "number"
                        ? prev.min
                        : 0;
                    const clamped = Math.min(
                      Math.max(0, val),
                      dataMaxPrice,
                    );
                    return {
                      ...prev,
                      max: clamped < min ? min : clamped,
                    };
                  });
                }}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="graph-container">
        <div className="graph-header">
          <h2 className="graph-title">
            Spending Visualization
          </h2>
          <button
            className="reset-zoom-button"
            onClick={resetZoom}
          >
            Reset Zoom
          </button>
        </div>
        <div className="graph-canvas-wrapper">
          <canvas
            ref={canvasRef}
            id="expense-graph"
            className="graph-canvas"
            onMouseMove={handleMouseMove}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onMouseLeave={() => {
              handleCanvasMouseLeave();
              handleMouseUp();
            }}
            style={{ cursor: isPanning ? "grabbing" : "grab" }}
          ></canvas>
        </div>
      </div>

      {tooltip && (
        <div
          className="tooltip"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          <ul>
            {tooltip.items.map((itemDetail, index) => (
              <li
                key={index}
              >{`${itemDetail.item}, $${itemDetail.price.toFixed(2)}`}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}