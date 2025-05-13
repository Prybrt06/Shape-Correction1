import React, { useRef, useEffect, useState } from "react";

const distance = (p1, p2) => Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);

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

const regularizeFreehandCurve = (points, epsilon) => {
  if (points.length < 5) return points;

  const fitted = fitCircle(points);
  if (fitted) {
    const { center, radius } = fitted;
    const angleStep = (2 * Math.PI) / points.length;

    return points.map((_, i) => {
      const angle = i * angleStep;
      return {
        x: center.x + radius * Math.cos(angle),
        y: center.y + radius * Math.sin(angle),
      };
    });
  }

  const smoothed = [];
  const windowSize = 5;
  const halfWindow = Math.floor(windowSize / 2);

  for (let i = 0; i < points.length; i++) {
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

  return simplifyPath(smoothed, epsilon / 2);
};

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

const DrawingApp = () => {
  const canvasRef = useRef(null);
  const contextRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [paths, setPaths] = useState([]);
  const [originalPaths, setOriginalPaths] = useState([]);
  const [tool, setTool] = useState("pencil");
  const [isUndoUsed, setIsUndoUsed] = useState(false);
  const [epsilon, setEpsilon] = useState(1.0);
  const connectionThreshold = 20;
  let currentPath = [];

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

  const redrawCanvas = (updatedPaths) => {
    const context = contextRef.current;
    context.clearRect(0, 0, 800, 500);
    updatedPaths.forEach((path) => {
      if (path.isCircle) {
        context.beginPath();
        context.arc(path.center.x, path.center.y, path.radius, 0, 2 * Math.PI);
        context.stroke();
        context.closePath();
      } else {
        context.beginPath();
        context.moveTo(path[0].x, path[0].y);
        path.forEach((point) => {
          context.lineTo(point.x, point.y);
        });
        context.stroke();
        context.closePath();
      }
    });
  };

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
    setIsUndoUsed(false);
  };

  const draw = ({ nativeEvent }) => {
    if (!isDrawing) return;
    const { offsetX, offsetY } = nativeEvent;
    contextRef.current.lineTo(offsetX, offsetY);
    contextRef.current.stroke();
    currentPath.push({ x: offsetX, y: offsetY });
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    if (currentPath.length < 2) return;

    const circle = fitCircle(currentPath);

    if (circle) {
      setPaths((prevPaths) => {
        const newPaths = [...prevPaths, { isCircle: true, ...circle }];
        setOriginalPaths((prevOriginalPaths) => [...prevOriginalPaths, currentPath]);
        redrawCanvas(newPaths);
        return newPaths;
      });
    } else {
      setPaths((prevPaths) => {
        let newPaths = [...prevPaths];
        let newOriginalPaths = [...originalPaths];

        if (prevPaths.length > 0) {
          const lastOriginal = newOriginalPaths[newOriginalPaths.length - 1];
          const lastPoint = lastOriginal[lastOriginal.length - 1];
          const firstPoint = currentPath[0];

          if (distance(lastPoint, firstPoint) < connectionThreshold) {
            const midPoint = {
              x: (lastPoint.x + firstPoint.x) / 2,
              y: (lastPoint.y + firstPoint.y) / 2,
            };

            newOriginalPaths.pop();
            const mergedPath = [...lastOriginal, midPoint, ...currentPath];
            newOriginalPaths.push(mergedPath);

            const newRegularized = regularizeFreehandCurve(mergedPath, epsilon);
            newPaths.pop();
            newPaths.push(newRegularized);
          } else {
            newOriginalPaths.push(currentPath);
            newPaths.push(regularizeFreehandCurve(currentPath, epsilon));
          }
        } else {
          newOriginalPaths.push(currentPath);
          newPaths.push(regularizeFreehandCurve(currentPath, epsilon));
        }

        setOriginalPaths(newOriginalPaths);
        redrawCanvas(newPaths);
        return newPaths;
      });
    }
  };

  const eraseStroke = (x, y) => {
    setPaths((prevPaths) => {
      const newPaths = prevPaths.filter((path) => {
        if (path.isCircle) {
          return distance({ x, y }, path.center) > path.radius;
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

  const undoLastConnection = () => {
    if (isUndoUsed) return;

    setPaths((prevPaths) => {
      if (prevPaths.length === 0) return prevPaths;

      const newPaths = [...prevPaths];
      const newOriginalPaths = [...originalPaths];
      const lastOriginalPath = newOriginalPaths.pop();

      if (lastOriginalPath) {
        newPaths.pop();
        newPaths.push(regularizeFreehandCurve(lastOriginalPath, epsilon));
      }

      redrawCanvas(newPaths);

      setIsUndoUsed(true);
      return newPaths;
    });
  };

  const downloadSVG = () => {
    const canvas = canvasRef.current;
    const width = canvas.width;
    const height = canvas.height;

    let svgContent = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;

    paths.forEach((path) => {
      if (path.isCircle) {
        svgContent += `<circle cx="${path.center.x}" cy="${path.center.y}" r="${path.radius}" stroke="black" fill="none" stroke-width="5" />`;
      } else {
        svgContent += `<path d="M ${path[0].x} ${path[0].y} ${path
          .map((point) => `L ${point.x} ${point.y}`)
          .join(
            " "
          )}" stroke="black" fill="none" stroke-width="5" stroke-linecap="round" />`;
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
          className="p-2 bg-blue-500 text-white rounded-lg"
        >
          ✏️ Pencil
        </button>
        <button
          onClick={() => setTool("eraser")}
          className="p-2 bg-gray-500 text-white rounded-lg"
        >
          🧽 Eraser
        </button>
        <button
          onClick={undoLastConnection}
          className="p-2 bg-red-500 text-white rounded-lg"
        >
          Undo
        </button>
        <button
          onClick={downloadSVG}
          className="p-2 bg-green-500 text-white rounded-lg"
        >
          Download SVG
        </button>
      </div>
      <div className="mt-4">
        <label
          htmlFor="epsilon-slider"
          className="block text-sm font-medium text-gray-700"
        >
          Epsilon (Regularization Strength): {epsilon}
        </label>
        <input
          id="epsilon-slider"
          type="range"
          min="1"
          max="50"
          value={epsilon}
          onChange={(e) => setEpsilon(parseFloat(e.target.value))}
          className="w-64"
        />
      </div>
    </div>
  );
};

export default DrawingApp;
