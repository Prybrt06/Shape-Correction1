import React, { useRef, useEffect, useState } from "react";
import "./App.css";
import { Pencil, Eraser, Circle, Square, Undo, Download } from "lucide-react";

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
  const isClosed =
    distance(simplified[0], simplified[simplified.length - 1]) < 20;
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
  if (!angles.every((angle) => Math.abs(angle - 90) < angleThreshold))
    return null;

  // Calculate bounding rectangle
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
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
      { x: minX, y: maxY },
    ],
  };
};

// Fit circle to points
const fitCircle = (points) => {
  const n = points.length;
  if (n < 10) return null;

  let sumX = 0,
    sumY = 0,
    sumX2 = 0,
    sumY2 = 0,
    sumX3 = 0,
    sumY3 = 0,
    sumXY = 0,
    sumX1Y2 = 0,
    sumX2Y1 = 0;

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

  if (variance < 30 && aspectRatio < 2 && startEndDistance < 20) {
    return { center: { x: centerX, y: centerY }, radius };
  }

  return null;
};

// Improved ellipse fitting using PCA
const fitEllipse = (points) => {
  if (points.length < 10) return null;

  // Calculate centroid
  const centroid = points.reduce(
    (acc, p) => {
      acc.x += p.x;
      acc.y += p.y;
      return acc;
    },
    { x: 0, y: 0 }
  );
  centroid.x /= points.length;
  centroid.y /= points.length;

  // Center points
  const centered = points.map((p) => ({
    x: p.x - centroid.x,
    y: p.y - centroid.y,
  }));

  // Calculate covariance matrix
  let xx = 0,
    xy = 0,
    yy = 0;
  centered.forEach((p) => {
    xx += p.x * p.x;
    xy += p.x * p.y;
    yy += p.y * p.y;
  });
  xx /= points.length;
  xy /= points.length;
  yy /= points.length;

  // Calculate eigenvalues
  const trace = xx + yy;
  const det = xx * yy - xy * xy;
  const discriminant = Math.sqrt((trace * trace) / 4 - det);
  const lambda1 = trace / 2 + discriminant;
  const lambda2 = trace / 2 - discriminant;

  // Calculate major and minor axes
  const major = Math.sqrt(lambda1) * 2;
  const minor = Math.sqrt(lambda2) * 2;

  // Calculate rotation angle
  let angle = 0;
  if (xy !== 0) {
    angle = (Math.atan2(lambda1 - xx, xy) * 180) / Math.PI;
  }

  // Check if it's actually ellipse-like
  const startPoint = points[0];
  const endPoint = points[points.length - 1];
  const startEndDistance = distance(startPoint, endPoint);

  if (startEndDistance > 20) return null;

  return {
    center: centroid,
    rx: major / 1.5,
    ry: minor / 1.5,
    angle,
  };
};

// Check if strokes should be connected
const shouldConnectStrokes = (stroke1, stroke2, threshold = 20) => {
  const end1 = stroke1[stroke1.length - 1];
  const start2 = stroke2[0];
  return distance(end1, start2) < threshold;
};

// Combine strokes
const combineStrokes = (stroke1, stroke2) => {
  return [...stroke1, ...stroke2];
};

// Regularize path based on selected mode
const regularizePath = (points, epsilon, mode, shouldClose = false) => {
  if (points.length < 5) return points;

  // Keep original starting point
  const originalStartPoint = points[0];

  // Process based on selected mode
  switch (mode) {
    case "circle":
      const circle = fitCircle(points);
      if (circle) {
        const { center, radius } = circle;
        const angleStep = (2 * Math.PI) / points.length;
        const regularized = points.map((_, i) => ({
          x: center.x + radius * Math.cos(i * angleStep),
          y: center.y + radius * Math.sin(i * angleStep),
        }));
        if (shouldClose) regularized.push({ ...originalStartPoint });
        return regularized;
      }

      const ellipse = fitEllipse(points);
      if (ellipse) {
        const { center, rx, ry, angle } = ellipse;
        const angleStep = (2 * Math.PI) / points.length;
        const cosAngle = Math.cos((angle * Math.PI) / 180);
        const sinAngle = Math.sin((angle * Math.PI) / 180);

        const regularized = points.map((_, i) => {
          const theta = i * angleStep;
          const x = rx * Math.cos(theta);
          const y = ry * Math.sin(theta);

          // Apply rotation
          return {
            x: center.x + (x * cosAngle - y * sinAngle),
            y: center.y + (x * sinAngle + y * cosAngle),
          };
        });

        if (shouldClose) regularized.push({ ...originalStartPoint });
        return regularized;
      }
      break;

    case "rectangle":
      const rectangle = detectRectangle(points);
      if (rectangle) {
        return [
          ...rectangle.corners,
          { ...rectangle.corners[0], isClosed: true },
        ];
      }
      break;
  }

  // Default: freehand with light regularization
  const smoothed = [{ ...originalStartPoint }];
  const windowSize = 5;
  const halfWindow = Math.floor(windowSize / 2);

  for (let i = 1; i < points.length; i++) {
    let sumX = 0,
      sumY = 0,
      count = 0;
    for (let j = i - halfWindow; j <= i + halfWindow; j++) {
      if (j >= 0 && j < points.length) {
        sumX += points[j].x;
        sumY += points[j].y;
        count++;
      }
    }
    smoothed.push({ x: sumX / count, y: sumY / count });
  }

  const simplified = simplifyPath(
    smoothed,
    mode === "freehand" ? epsilon / 4 : epsilon / 2
  );
  simplified[0] = { ...originalStartPoint };
  if (shouldClose) simplified.push({ ...originalStartPoint });

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

    // Add keyboard event listener
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        undoLastAction();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
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
          path.center.x,
          path.center.y,
          path.rx,
          path.ry,
          (path.angle * Math.PI) / 180,
          0,
          2 * Math.PI
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
        path.slice(1).forEach((point) => context.lineTo(point.x, point.y));
        context.closePath();
        context.stroke();
      } else {
        context.beginPath();
        context.moveTo(path[0].x, path[0].y);
        path.slice(1).forEach((point) => context.lineTo(point.x, point.y));
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

    setPaths((prevPaths) => {
      const newPaths = [...prevPaths];
      const newOriginalPaths = [...originalPaths];
      const newIsRegularized = [...isRegularized];

      // Check if we can connect with previous stroke in any mode
      if (newOriginalPaths.length > 0) {
        const lastOriginal = newOriginalPaths[newOriginalPaths.length - 1];

        if (shouldConnectStrokes(lastOriginal, currentPath, connectionThreshold)) {
          // Combine the strokes
          const combined = combineStrokes(lastOriginal, currentPath);

          newPaths.pop();
          newOriginalPaths.pop();
          newIsRegularized.pop();

          const shouldClose =
            distance(combined[0], combined[combined.length - 1]) < closeThreshold;
          const regularized = regularizePath(
            combined,
            epsilon,
            mode,
            shouldClose
          );

          // Process based on current mode
          if (mode === "circle" && shouldClose) {
            const circle = fitCircle(combined);
            if (circle) {
              newPaths.push({ isCircle: true, ...circle });
            } else {
              const ellipse = fitEllipse(combined);
              if (ellipse) {
                newPaths.push({ isEllipse: true, ...ellipse });
              } else {
                newPaths.push(
                  shouldClose ? [...regularized, { isClosed: true }] : regularized
                );
              }
            }
          } else if (mode === "rectangle" && shouldClose) {
            const rectangle = detectRectangle(combined);
            if (rectangle) {
              newPaths.push([
                ...rectangle.corners,
                { ...rectangle.corners[0], isClosed: true },
              ]);
            } else {
              newPaths.push(
                shouldClose ? [...regularized, { isClosed: true }] : regularized
              );
            }
          } else {
            newPaths.push(
              shouldClose ? [...regularized, { isClosed: true }] : regularized
            );
          }

          newOriginalPaths.push(combined);
          newIsRegularized.push(true);

          setOriginalPaths(newOriginalPaths);
          setIsRegularized(newIsRegularized);
          redrawCanvas(newPaths);
          return newPaths;
        }
      }

      // If not combining, process as new stroke
      const shouldClose =
        distance(currentPath[0], currentPath[currentPath.length - 1]) <
        closeThreshold;
      const regularized = regularizePath(
        currentPath,
        epsilon,
        mode,
        shouldClose
      );

      newOriginalPaths.push(currentPath);

      if (mode === "circle" && shouldClose) {
        const circle = fitCircle(currentPath);
        if (circle) {
          newPaths.push({ isCircle: true, ...circle });
        } else {
          const ellipse = fitEllipse(currentPath);
          if (ellipse) {
            newPaths.push({ isEllipse: true, ...ellipse });
          } else {
            newPaths.push(
              shouldClose ? [...regularized, { isClosed: true }] : regularized
            );
          }
        }
      } else if (mode === "rectangle" && shouldClose) {
        const rectangle = detectRectangle(currentPath);
        if (rectangle) {
          newPaths.push([
            ...rectangle.corners,
            { ...rectangle.corners[0], isClosed: true },
          ]);
        } else {
          newPaths.push(
            shouldClose ? [...regularized, { isClosed: true }] : regularized
          );
        }
      } else {
        newPaths.push(
          shouldClose ? [...regularized, { isClosed: true }] : regularized
        );
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
        if (path.isCircle) {
          return distance({ x, y }, path.center) > path.radius;
        } else if (path.isEllipse) {
          // More precise ellipse hit testing
          const dx = x - path.center.x;
          const dy = y - path.center.y;
          const cosAngle = Math.cos((path.angle * Math.PI) / 180);
          const sinAngle = Math.sin((path.angle * Math.PI) / 180);

          // Rotate point into ellipse's coordinate system
          const xRot = dx * cosAngle + dy * sinAngle;
          const yRot = -dx * sinAngle + dy * cosAngle;

          // Check if point is inside ellipse
          return (
            (xRot * xRot) / (path.rx * path.rx) +
              (yRot * yRot) / (path.ry * path.ry) >
            1
          );
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

  // Undo last action
  const undoLastAction = () => {
    setPaths((prevPaths) => {
      if (prevPaths.length === 0) return prevPaths;

      const newPaths = [...prevPaths];
      const newOriginalPaths = [...originalPaths];
      const newIsRegularized = [...isRegularized];

      newPaths.pop();
      newOriginalPaths.pop();
      newIsRegularized.pop();

      setOriginalPaths(newOriginalPaths);
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
        svgContent += `<ellipse cx="${path.center.x}" cy="${path.center.y}" rx="${path.rx}" ry="${path.ry}" transform="rotate(${path.angle} ${path.center.x} ${path.center.y})" stroke="black" fill="none" stroke-width="5" />`;
      } else if (path.isClosed && path.length === 5 && path[4].isClosed) {
        // Rectangle
        svgContent += `<path d="M ${path[0].x} ${path[0].y} L ${path[1].x} ${path[1].y} L ${path[2].x} ${path[2].y} L ${path[3].x} ${path[3].y} Z" stroke="black" fill="none" stroke-width="5" />`;
      } else if (path.isClosed) {
        svgContent += `<path d="M ${path[0].x} ${path[0].y} ${path
          .slice(1)
          .map((p) => `L ${p.x} ${p.y}`)
          .join(" ")} Z" stroke="black" fill="none" stroke-width="5" />`;
      } else {
        svgContent += `<path d="M ${path[0].x} ${path[0].y} ${path
          .slice(1)
          .map((p) => `L ${p.x} ${p.y}`)
          .join(" ")}" stroke="black" fill="none" stroke-width="5" />`;
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
    <div className="app-container">
      <h1>Free Hand Drawing Canvas</h1>
      <canvas
        ref={canvasRef}
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
      />

      <div className="buttons">
        <div className="tool-buttons">
          <button
            onClick={() => {
              setTool("pencil");
              setMode("freehand");
            }}
            className={`button ${
              tool === "pencil" && mode === "freehand" ? "active" : "bg-gray"
            }`}
          >
            <Pencil />
          </button>

          <button
            onClick={() => {setMode("null"); setTool("eraser");}}
            className={`button ${tool === "eraser" ? "active" : "bg-gray"}`}
          >
            <Eraser />
          </button>
        </div>

        <div className="mode-buttons">
          <button
            onClick={() => {setTool(null); setMode("circle");}}
            className={`button ${mode === "circle" ? "active" : "bg-gray"}`}
          >
            <Circle />
          </button>

          <button
            onClick={() => {setTool(null); setMode("rectangle");}}
            className={`button ${mode === "rectangle" ? "active" : "bg-gray"}`}
          >
            <Square />
          </button>
        </div>

        <div className="action-buttons">
          <button onClick={undoLastAction}>
            <Undo />
          </button>

          <button onClick={downloadSVG}>
            <Download />
          </button>
        </div>

        <div className="slider-container">
          <p>Path Straightener</p>
          <input
            className="slider"
            type="range"
            min="1"
            max="50"
            value={epsilon}
            onChange={(e) => setEpsilon(parseFloat(e.target.value))}
          />
        </div>
      </div>
    </div>
  );
};

export default DrawingApp;