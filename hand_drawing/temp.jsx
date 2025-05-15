import React, { useRef, useEffect, useState } from "react";

// Utility functions
const distance = (p1, p2) => Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);
const angleBetweenLines = (p1, p2, p3) => {
  const v1 = { x: p1.x - p2.x, y: p1.y - p2.y };
  const v2 = { x: p3.x - p2.x, y: p3.y - p2.y };
  const dot = v1.x * v2.x + v1.y * v2.y;
  const mag1 = Math.sqrt(v1.x ** 2 + v1.y ** 2);
  const mag2 = Math.sqrt(v2.x ** 2 + v2.y ** 2);
  return Math.acos(dot / (mag1 * mag2)) * (180 / Math.PI);
};

// Path simplification using Ramer-Douglas-Peucker algorithm
const simplifyPath = (points, epsilon) => {
  if (points.length < 3) return points;

  const perpendicularDistance = (pt, lineStart, lineEnd) => {
    const dx = lineEnd.x - lineStart.x;
    const dy = lineEnd.y - lineStart.y;
    const mag = dx * dx + dy * dy;
    let u = ((pt.x - lineStart.x) * dx + (pt.y - lineStart.y) * dy) / mag;
    u = Math.max(0, Math.min(1, u));
    const x = lineStart.x + u * dx;
    const y = lineStart.y + u * dy;
    return Math.sqrt((pt.x - x) ** 2 + (pt.y - y) ** 2);
  };

  const rdp = (pts, start, end, epsilon, simplified) => {
    let maxDist = 0;
    let index = start;
    for (let i = start + 1; i < end; i++) {
      const dist = perpendicularDistance(pts[i], pts[start], pts[end]);
      if (dist > maxDist) {
        maxDist = dist;
        index = i;
      }
    }

    if (maxDist > epsilon) {
      rdp(pts, start, index, epsilon, simplified);
      simplified.push(pts[index]);
      rdp(pts, index, end, epsilon, simplified);
    }
  };

  const simplified = [points[0]];
  rdp(points, 0, points.length - 1, epsilon, simplified);
  simplified.push(points[points.length - 1]);
  return simplified;
};

// Detect if points form a rectangle
const detectRectangle = (points, angleThreshold = 15) => {
  if (points.length < 4) return null;

  // Simplify to find corners
  const simplified = simplifyPath(points, 10);
  if (simplified.length !== 4 && simplified.length !== 5) return null;

  // Check if closed shape
  const isClosed = distance(simplified[0], simplified[simplified.length - 1]) < 20;
  const corners = isClosed ? simplified.slice(0, 4) : simplified;
  if (corners.length !== 4) return null;

  // Calculate angles between adjacent lines
  const angles = [];
  for (let i = 0; i < 4; i++) {
    const p1 = corners[i];
    const p2 = corners[(i + 1) % 4];
    const p3 = corners[(i + 2) % 4];
    angles.push(angleBetweenLines(p1, p2, p3));
  }

  // Check if all angles are approximately 90 degrees
  if (!angles.every(angle => Math.abs(angle - 90) < angleThreshold)) return null;

  // Calculate bounding rectangle
  const xs = corners.map(p => p.x);
  const ys = corners.map(p => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
    corners: [
      { x: minX, y: minY },
      { x: maxX, y: minY },
      { x: maxX, y: maxY },
      { x: minX, y: maxY }
    ]
  };
};

// Fit circle to points
const fitCircle = (points) => {
  const n = points.length;
  if (n < 10) return null;

  let sumX = 0, sumY = 0, sumX2 = 0, sumY2 = 0, sumX3 = 0, sumY3 = 0, sumXY = 0, sumX1Y2 = 0, sumX2Y1 = 0;

  points.forEach(({ x, y }) => {
    sumX += x;
    sumY += y;
    sumX2 += x * x;
    sumY2 += y * y;
    sumX3 += x * x * x;
    sumY3 += y * y * y;
    sumXY += x * y;
    sumX1Y2 += x * y * y;
    sumX2Y1 += x * x * y;
  });

  const A = n * sumX2 - sumX * sumX;
  const B = n * sumXY - sumX * sumY;
  const C = n * sumY2 - sumY * sumY;
  const D = 0.5 * (n * sumX1Y2 - sumX * sumY2 + n * sumX3 - sumX * sumX2);
  const E = 0.5 * (n * sumX2Y1 - sumY * sumX2 + n * sumY3 - sumY * sumY2);

  const centerX = (D * C - B * E) / (A * C - B * B);
  const centerY = (A * E - B * D) / (A * C - B * B);

  const radius = Math.sqrt(
    points.reduce(
      (sum, { x, y }) => sum + (x - centerX) ** 2 + (y - centerY) ** 2,
      0
    ) / n
  );

  // Check if points actually form a circle
  const distances = points.map(({ x, y }) =>
    Math.abs(Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2) - radius)
  );
  const variance = distances.reduce((sum, dist) => sum + dist ** 2, 0) / n;

  const minX = Math.min(...points.map((p) => p.x));
  const maxX = Math.max(...points.map((p) => p.x));
  const minY = Math.min(...points.map((p) => p.y));
  const maxY = Math.max(...points.map((p) => p.y));
  const width = maxX - minX;
  const height = maxY - minY;
  const aspectRatio = Math.max(width, height) / Math.min(width, height);

  const startPoint = points[0];
  const endPoint = points[points.length - 1];
  const startEndDistance = distance(startPoint, endPoint);

  if (
    variance < 30 &&
    aspectRatio < 2 &&
    startEndDistance < 20
  ) {
    return { center: { x: centerX, y: centerY }, radius };
  }

  return null;
};

// Fit ellipse to points (simplified approach)
const fitEllipse = (points) => {
  if (points.length < 10) return null;
  
  // Simple approach: use bounding box
  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  
  const center = {
    x: (minX + maxX) / 2,
    y: (minY + maxY) / 2
  };
  
  const rx = (maxX - minX) / 2;
  const ry = (maxY - minY) / 2;
  
  // Check if it's actually ellipse-like
  const startPoint = points[0];
  const endPoint = points[points.length - 1];
  const startEndDistance = distance(startPoint, endPoint);
  
  if (startEndDistance > 20) return null;
  
  return { center, rx, ry };
};

// Regularize path based on selected mode
const regularizePath = (points, epsilon, mode, shouldClose = false) => {
  if (points.length < 5) return points;

  // Keep original starting point
  const originalStartPoint = points[0];

  // Process based on selected mode
  switch (mode) {
    case 'circle':
      const circle = fitCircle(points);
      if (circle) {
        const { center, radius } = circle;
        const angleStep = (2 * Math.PI) / points.length;
        const regularized = points.map((_, i) => ({
          x: center.x + radius * Math.cos(i * angleStep),
          y: center.y + radius * Math.sin(i * angleStep),
        }));
        if (shouldClose) regularized.push({...originalStartPoint});
        return regularized;
      }
      
      const ellipse = fitEllipse(points);
      if (ellipse) {
        const { center, rx, ry } = ellipse;
        const angleStep = (2 * Math.PI) / points.length;
        const regularized = points.map((_, i) => ({
          x: center.x + rx * Math.cos(i * angleStep),
          y: center.y + ry * Math.sin(i * angleStep),
        }));
        if (shouldClose) regularized.push({...originalStartPoint});
        return regularized;
      }
      break;

    case 'rectangle':
      const rectangle = detectRectangle(points);
      if (rectangle) {
        return [...rectangle.corners, { ...rectangle.corners[0], isClosed: true }];
      }
      break;
  }

  // Default: freehand with light regularization
  const smoothed = [{...originalStartPoint}];
  const windowSize = 5;
  const halfWindow = Math.floor(windowSize / 2);

  for (let i = 1; i < points.length; i++) {
    let sumX = 0, sumY = 0, count = 0;
    for (let j = i - halfWindow; j <= i + halfWindow; j++) {
      if (j >= 0 && j < points.length) {
        sumX += points[j].x;
        sumY += points[j].y;
        count++;
      }
    }
    smoothed.push({ x: sumX / count, y: sumY / count });
  }

  const simplified = simplifyPath(smoothed, mode === 'freehand' ? epsilon / 4 : epsilon / 2);
  simplified[0] = {...originalStartPoint};
  if (shouldClose) simplified.push({...originalStartPoint});
  
  return simplified;
};

const DrawingApp = () => {
  const canvasRef = useRef(null);
  const contextRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [paths, setPaths] = useState([]);
  const [originalPaths, setOriginalPaths] = useState([]);
  const [tool, setTool] = useState("pencil");
  const [mode, setMode] = useState("freehand");
  const [epsilon, setEpsilon] = useState(1.0);
  const [isRegularized, setIsRegularized] = useState([]);
  const connectionThreshold = 20;
  const closeThreshold = 15;
  let currentPath = [];

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    canvas.width = 800;
    canvas.height = 500;
    canvas.style.border = "2px solid black";
    const context = canvas.getContext("2d");
    context.lineCap = "round";
    context.lineWidth = 5;
    context.strokeStyle = "black";
    contextRef.current = context;
  }, []);

  // Redraw all paths
  const redrawCanvas = (updatedPaths) => {
    const context = contextRef.current;
    context.clearRect(0, 0, 800, 500);
    updatedPaths.forEach((path) => {
      if (path.isCircle) {
        context.beginPath();
        context.arc(path.center.x, path.center.y, path.radius, 0, 2 * Math.PI);
        context.stroke();
      } else if (path.isEllipse) {
        context.beginPath();
        context.ellipse(
          path.center.x, path.center.y,
          path.rx, path.ry,
          0, 0, 2 * Math.PI
        );
        context.stroke();
      } else if (path.isClosed && path.length === 5 && path[4].isClosed) {
        // Draw rectangle
        context.beginPath();
        context.moveTo(path[0].x, path[0].y);
        for (let i = 1; i < 4; i++) {
          context.lineTo(path[i].x, path[i].y);
        }
        context.closePath();
        context.stroke();
      } else if (path.isClosed) {
        context.beginPath();
        context.moveTo(path[0].x, path[0].y);
        path.slice(1).forEach(point => context.lineTo(point.x, point.y));
        context.closePath();
        context.stroke();
      } else {
        context.beginPath();
        context.moveTo(path[0].x, path[0].y);
        path.slice(1).forEach(point => context.lineTo(point.x, point.y));
        context.stroke();
      }
    });
  };

  // Start drawing
  const startDrawing = ({ nativeEvent }) => {
    const { offsetX, offsetY } = nativeEvent;
    if (tool === "eraser") {
      eraseStroke(offsetX, offsetY);
      return;
    }
    setIsDrawing(true);
    contextRef.current.beginPath();
    contextRef.current.moveTo(offsetX, offsetY);
    currentPath = [{ x: offsetX, y: offsetY }];
  };

  // Draw stroke
  const draw = ({ nativeEvent }) => {
    if (!isDrawing) return;
    const { offsetX, offsetY } = nativeEvent;
    contextRef.current.lineTo(offsetX, offsetY);
    contextRef.current.stroke();
    currentPath.push({ x: offsetX, y: offsetY });
  };

  // Stop drawing and process stroke
  const stopDrawing = () => {
    setIsDrawing(false);
    if (currentPath.length < 2) return;

    // Check if stroke should be closed
    const shouldClose = distance(currentPath[0], currentPath[currentPath.length - 1]) < closeThreshold;
    
    setPaths((prevPaths) => {
      const newPaths = [...prevPaths];
      const newOriginalPaths = [...originalPaths];
      const newIsRegularized = [...isRegularized];

      // First check if we should connect to previous path
      if (newPaths.length > 0 && newOriginalPaths.length > 0) {
        const lastOriginal = newOriginalPaths[newOriginalPaths.length - 1];
        const lastPoint = lastOriginal[lastOriginal.length - 1];
        const firstPoint = currentPath[0];

        if (distance(lastPoint, firstPoint) < connectionThreshold) {
          // Connect the paths first
          const midPoint = {
            x: (lastPoint.x + firstPoint.x) / 2,
            y: (lastPoint.y + firstPoint.y) / 2,
          };

          newOriginalPaths.pop();
          const mergedPath = [...lastOriginal, midPoint, ...currentPath];
          newOriginalPaths.push(mergedPath);

          // Then regularize the connected path
          const newRegularized = regularizePath(mergedPath, epsilon, mode);
          newPaths.pop();
          newPaths.push(newRegularized);
          newIsRegularized.pop();
          newIsRegularized.push(true);
          
          setOriginalPaths(newOriginalPaths);
          setIsRegularized(newIsRegularized);
          redrawCanvas(newPaths);
          return newPaths;
        }
      }

      // If not connecting, process as new stroke
      const regularized = regularizePath(currentPath, epsilon, mode, shouldClose);
      newOriginalPaths.push(currentPath);
      
      if (mode === 'circle' && shouldClose) {
        const circle = fitCircle(currentPath);
        if (circle) {
          newPaths.push({ isCircle: true, ...circle });
        } else {
          const ellipse = fitEllipse(currentPath);
          if (ellipse) {
            newPaths.push({ isEllipse: true, ...ellipse });
          } else {
            newPaths.push(shouldClose ? [...regularized, {isClosed: true}] : regularized);
          }
        }
      } else if (mode === 'rectangle' && shouldClose) {
        const rectangle = detectRectangle(currentPath);
        if (rectangle) {
          newPaths.push([...rectangle.corners, { ...rectangle.corners[0], isClosed: true }]);
        } else {
          newPaths.push(shouldClose ? [...regularized, {isClosed: true}] : regularized);
        }
      } else {
        newPaths.push(shouldClose ? [...regularized, {isClosed: true}] : regularized);
      }
      
      newIsRegularized.push(true);

      setOriginalPaths(newOriginalPaths);
      setIsRegularized(newIsRegularized);
      redrawCanvas(newPaths);
      return newPaths;
    });
  };

  // Erase stroke
  const eraseStroke = (x, y) => {
    setPaths((prevPaths) => {
      const newPaths = prevPaths.filter((path) => {
        if (path.isCircle || path.isEllipse) {
          return distance({ x, y }, path.center) > Math.max(path.radius || 0, path.rx || 0);
        } else {
          return !path.some((point, index) => {
            if (index === 0) return false;
            const prevPoint = path[index - 1];
            const distToSegment =
              Math.abs(
                (point.y - prevPoint.y) * x -
                  (point.x - prevPoint.x) * y +
                  point.x * prevPoint.y -
                  point.y * prevPoint.x
              ) / distance(point, prevPoint);
            return distToSegment < connectionThreshold;
          });
        }
      });
      redrawCanvas(newPaths);
      return newPaths;
    });
  };

  // Undo last regularization
  const undoLastRegularization = () => {
    setPaths((prevPaths) => {
      if (prevPaths.length === 0 || originalPaths.length === 0) return prevPaths;

      const newPaths = [...prevPaths];
      const newIsRegularized = [...isRegularized];
      
      // Find the last regularized path
      let lastRegularizedIndex = -1;
      for (let i = newIsRegularized.length - 1; i >= 0; i--) {
        if (newIsRegularized[i]) {
          lastRegularizedIndex = i;
          break;
        }
      }

      if (lastRegularizedIndex === -1) return prevPaths;

      // Replace the regularized path with the original
      const originalPath = originalPaths[lastRegularizedIndex];
      const shouldClose = distance(originalPath[0], originalPath[originalPath.length - 1]) < closeThreshold;
      newPaths[lastRegularizedIndex] = shouldClose ? [...originalPath, {isClosed: true}] : originalPath;
      newIsRegularized[lastRegularizedIndex] = false;
      
      setIsRegularized(newIsRegularized);
      redrawCanvas(newPaths);
      return newPaths;
    });
  };

  // Download as SVG
  const downloadSVG = () => {
    const canvas = canvasRef.current;
    const width = canvas.width;
    const height = canvas.height;

    let svgContent = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;

    paths.forEach((path) => {
      if (path.isCircle) {
        svgContent += `<circle cx="${path.center.x}" cy="${path.center.y}" r="${path.radius}" stroke="black" fill="none" stroke-width="5" />`;
      } else if (path.isEllipse) {
        svgContent += `<ellipse cx="${path.center.x}" cy="${path.center.y}" rx="${path.rx}" ry="${path.ry}" stroke="black" fill="none" stroke-width="5" />`;
      } else if (path.isClosed && path.length === 5 && path[4].isClosed) {
        // Rectangle
        svgContent += `<path d="M ${path[0].x} ${path[0].y} L ${path[1].x} ${path[1].y} L ${path[2].x} ${path[2].y} L ${path[3].x} ${path[3].y} Z" stroke="black" fill="none" stroke-width="5" />`;
      } else if (path.isClosed) {
        svgContent += `<path d="M ${path[0].x} ${path[0].y} ${path.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ')} Z" stroke="black" fill="none" stroke-width="5" />`;
      } else {
        svgContent += `<path d="M ${path[0].x} ${path[0].y} ${path.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ')}" stroke="black" fill="none" stroke-width="5" />`;
      }
    });

    svgContent += `</svg>`;

    const blob = new Blob([svgContent], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "drawing.svg";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col items-center p-4">
      <h1 className="text-2xl font-bold mb-4">Drawing Canvas</h1>
      <canvas
        ref={canvasRef}
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
        className="bg-white"
      />
      
      <div className="mt-4 flex gap-2">
        <button
          onClick={() => setTool("pencil")}
          className={`p-2 rounded-lg ${tool === "pencil" ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-800"}`}
        >
          ✏️ Pencil
        </button>
        <button
          onClick={() => setTool("eraser")}
          className={`p-2 rounded-lg ${tool === "eraser" ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-800"}`}
        >
          🧽 Eraser
        </button>
      </div>
      
      <div className="mt-4 flex gap-2">
        <button
          onClick={() => setMode("freehand")}
          className={`p-2 rounded-lg ${mode === "freehand" ? "bg-green-600 text-white" : "bg-gray-200 text-gray-800"}`}
        >
          Freehand
        </button>
        <button
          onClick={() => setMode("circle")}
          className={`p-2 rounded-lg ${mode === "circle" ? "bg-green-600 text-white" : "bg-gray-200 text-gray-800"}`}
        >
          Circle/Ellipse
        </button>
        <button
          onClick={() => setMode("rectangle")}
          className={`p-2 rounded-lg ${mode === "rectangle" ? "bg-green-600 text-white" : "bg-gray-200 text-gray-800"}`}
        >
          Rectangle
        </button>
      </div>
      
      <div className="mt-4 flex gap-2">
        <button
          onClick={undoLastRegularization}
          className="p-2 bg-red-500 text-white rounded-lg"
        >
          Undo Regularization
        </button>
        <button
          onClick={downloadSVG}
          className="p-2 bg-green-500 text-white rounded-lg"
        >
          Download SVG
        </button>
      </div>
      
      <div className="mt-4 flex items-center">
        <span className="text-2xl mr-2">~</span>
        <input
          type="range"
          min="1"
          max="50"
          value={epsilon}
          onChange={(e) => setEpsilon(parseFloat(e.target.value))}
          className="w-64"
        />
        <span className="text-2xl ml-2">/</span>
      </div>
    </div>
  );
};

export default DrawingApp;