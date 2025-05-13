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

const fitCircle = (points) => {
  const n = points.length;
  // if (n < 10) return null;

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

  const radius = Math.sqrt(points.reduce((sum, { x, y }) => sum + (x - centerX) ** 2 + (y - centerY) ** 2, 0) / n);

  // Calculate the variance of the distances from the center
  const distances = points.map(({ x, y }) => Math.abs(Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2) - radius));
  const variance = distances.reduce((sum, dist) => sum + dist ** 2, 0) / n;

  // Check if the points are close to the fitted circle
  const maxDeviation = Math.max(...distances);

  // Check the aspect ratio of the bounding box
  const minX = Math.min(...points.map(p => p.x));
  const maxX = Math.max(...points.map(p => p.x));
  const minY = Math.min(...points.map(p => p.y));
  const maxY = Math.max(...points.map(p => p.y));
  const width = maxX - minX;
  const height = maxY - minY;
  const aspectRatio = Math.max(width, height) / Math.min(width, height);

  // Check if the start and end points are close to each other
  const startPoint = points[0];
  const endPoint = points[points.length - 1];
  const startEndDistance = distance(startPoint, endPoint);

  // Thresholds for circle detection
  const circleThresholds = {
    variance: 100, // Maximum allowed variance
    aspectRatio: 2, // Maximum allowed aspect ratio
    startEndDistance: 20, // Maximum allowed distance between start and end points
  };

  // If all thresholds are satisfied, consider it a circle
  if (
    variance < circleThresholds.variance &&
    aspectRatio < circleThresholds.aspectRatio &&
    startEndDistance < circleThresholds.startEndDistance
  ) {
    return { center: { x: centerX, y: centerY }, radius };
  }

  return null;
};

const fitEllipse = (points) => {
  const n = points.length;
  // if (n < 10) return null;

  // Calculate the centroid (center) of the points
  const centroid = points.reduce(
    (acc, { x, y }) => ({ x: acc.x + x, y: acc.y + y }),
    { x: 0, y: 0 }
  );
  centroid.x /= n;
  centroid.y /= n;

  // Center the points by subtracting the centroid
  const centeredPoints = points.map(({ x, y }) => ({
    x: x - centroid.x,
    y: y - centroid.y,
  }));

  // Calculate the covariance matrix
  let covXX = 0,
    covYY = 0,
    covXY = 0;
  centeredPoints.forEach(({ x, y }) => {
    covXX += x * x;
    covYY += y * y;
    covXY += x * y;
  });
  covXX /= n;
  covYY /= n;
  covXY /= n;

  // Calculate the eigenvalues and eigenvectors of the covariance matrix
  const discriminant = Math.sqrt((covXX - covYY) ** 2 + 4 * covXY ** 2);
  const lambda1 = (covXX + covYY + discriminant) / 2; // Major axis eigenvalue
  const lambda2 = (covXX + covYY - discriminant) / 2; // Minor axis eigenvalue

  // Calculate the rotation angle (in radians)
  const angle = 0.5 * Math.atan2(2 * covXY, covXX - covYY);

  // Calculate the major and minor axes
  const majorAxis = Math.sqrt(lambda1) * 1.4; // Scale by 2 to match the spread
  const minorAxis = Math.sqrt(lambda2) * 1.4; // Scale by 2 to match the spread

  // Calculate the variance of the distances from the ellipse
  const distances = points.map(({ x, y }) => {
    const dx = x - centroid.x;
    const dy = y - centroid.y;
    const rotatedX = dx * Math.cos(-angle) - dy * Math.sin(-angle);
    const rotatedY = dx * Math.sin(-angle) + dy * Math.cos(-angle);
    const ellipseDist = Math.sqrt((rotatedX / majorAxis) ** 2 + (rotatedY / minorAxis) ** 2);
    return Math.abs(ellipseDist - 1);
  });
  const variance = distances.reduce((sum, dist) => sum + dist ** 2, 0) / n;

  // Check if the points are close to the fitted ellipse
  const maxDeviation = Math.max(...distances);

  // Check the aspect ratio of the bounding box
  const minX = Math.min(...points.map(p => p.x));
  const maxX = Math.max(...points.map(p => p.x));
  const minY = Math.min(...points.map(p => p.y));
  const maxY = Math.max(...points.map(p => p.y));
  const width = maxX - minX;
  const height = maxY - minY;
  const aspectRatio = Math.max(width, height) / Math.min(width, height);

  // Check if the start and end points are close to each other
  const startPoint = points[0];
  const endPoint = points[points.length - 1];
  const startEndDistance = distance(startPoint, endPoint);

  // Thresholds for ellipse detection
  const ellipseThresholds = {
    variance: 0.5, // Increased maximum allowed variance
    aspectRatio: 3, // Increased maximum allowed aspect ratio
    startEndDistance: 30, // Increased maximum allowed distance between start and end points
  };

  // If all thresholds are satisfied, consider it an ellipse
  if (
    variance < ellipseThresholds.variance &&
    aspectRatio < ellipseThresholds.aspectRatio &&
    startEndDistance < ellipseThresholds.startEndDistance
  ) {
    return {
      type: "ellipse",
      center: centroid,
      majorAxis,
      minorAxis,
      angle, // Rotation angle in radians
    };
  }

  return null;
};

const DrawingApp = () => {
  const canvasRef = useRef(null);
  const contextRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [paths, setPaths] = useState([]);
  const [originalPaths, setOriginalPaths] = useState([]);
  const [processedPaths, setProcessedPaths] = useState([]); // Store processed paths separately
  const [tool, setTool] = useState("pencil");
  const [epsilon, setEpsilon] = useState(20.0); // State for epsilon value
  const connectionThreshold = 20; // Threshold for connecting strokes
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
    updatedPaths.forEach(path => {
      if (path.isCircle) {
        context.beginPath();
        context.arc(path.center.x, path.center.y, path.radius, 0, 2 * Math.PI);
        context.stroke();
        context.closePath();
      } else if (path.isEllipse) {
        context.beginPath();
        context.ellipse(
          path.center.x,
          path.center.y,
          path.majorAxis,
          path.minorAxis,
          path.angle,
          0,
          2 * Math.PI
        );
        context.stroke();
        context.closePath();
      } else {
        context.beginPath();
        context.moveTo(path[0].x, path[0].y);
        path.forEach(point => {
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
    if (currentPath.length < 2) return; // Minimum points to consider for simplification
  
    // Store the original path
    const newOriginalPaths = [...originalPaths, currentPath];
    setOriginalPaths(newOriginalPaths);
    
    // Process the path (simplify or fit shape)
    const circle = fitCircle(currentPath);
    const ellipse = circle ? null : fitEllipse(currentPath);
    
    if (circle) {
      setPaths(prevPaths => {
        const newPaths = [...prevPaths, { isCircle: true, ...circle }];
        setProcessedPaths(prev => [...prev, { isCircle: true, ...circle }]);
        redrawCanvas(newPaths);
        return newPaths;
      });
    } else if (ellipse) {
      setPaths(prevPaths => {
        const newPaths = [...prevPaths, { isEllipse: true, ...ellipse }];
        setProcessedPaths(prev => [...prev, { isEllipse: true, ...ellipse }]);
        redrawCanvas(newPaths);
        return newPaths;
      });
    } else {
      setPaths(prevPaths => {
        let newPaths = [...prevPaths];
        let newProcessedPaths = [...processedPaths];
        
        // Check for connection with previous path
        if (prevPaths.length > 0) {
          const lastPath = prevPaths[prevPaths.length - 1];
          
          if (!lastPath.isCircle && !lastPath.isEllipse) {
            const lastPoint = lastPath[lastPath.length - 1];
            const firstPoint = currentPath[0];
            
            if (distance(lastPoint, firstPoint) < connectionThreshold) {
              // Connect the paths
              const midPoint = {
                x: (lastPoint.x + firstPoint.x) / 2,
                y: (lastPoint.y + firstPoint.y) / 2,
              };
              const mergedPath = [...lastPath, midPoint, ...currentPath];
              
              newPaths.pop();
              newPaths.push(simplifyPath(mergedPath, epsilon));
              newProcessedPaths.pop();
              newProcessedPaths.push(simplifyPath(mergedPath, epsilon));
            } else {
              newPaths.push(simplifyPath(currentPath, epsilon));
              newProcessedPaths.push(simplifyPath(currentPath, epsilon));
            }
          } else {
            newPaths.push(simplifyPath(currentPath, epsilon));
            newProcessedPaths.push(simplifyPath(currentPath, epsilon));
          }
        } else {
          newPaths.push(simplifyPath(currentPath, epsilon));
          newProcessedPaths.push(simplifyPath(currentPath, epsilon));
        }
        
        setProcessedPaths(newProcessedPaths);
        redrawCanvas(newPaths);
        return newPaths;
      });
    }
  };

  const eraseStroke = (x, y) => {
    setPaths(prevPaths => {
      const newPaths = prevPaths.filter(path => {
        if (path.isCircle) {
          return distance({ x, y }, path.center) > path.radius;
        } else {
          return !path.some((point, index) => {
            if (index === 0) return false;
            const prevPoint = path[index - 1];
            const distToSegment = Math.abs((point.y - prevPoint.y) * x - (point.x - prevPoint.x) * y + point.x * prevPoint.y - point.y * prevPoint.x) / distance(point, prevPoint);
            return distToSegment < connectionThreshold;
          });
        }
      });
      redrawCanvas(newPaths);
      return newPaths;
    });
  };

  const undoLastProcessing = () => {
    if (originalPaths.length === 0 || paths.length === 0) return;
    
    // Get the last original and processed paths
    const lastOriginalPath = originalPaths[originalPaths.length - 1];
    const lastProcessedPath = processedPaths[processedPaths.length - 1];
    
    // Check if the last path in the current display matches the last processed path
    if (JSON.stringify(paths[paths.length - 1]) === JSON.stringify(lastProcessedPath)) {
      // Replace the processed path with the original path
      setPaths(prevPaths => {
        const newPaths = [...prevPaths.slice(0, -1), lastOriginalPath];
        redrawCanvas(newPaths);
        return newPaths;
      });
    } else {
      // If the last path is already the original, do nothing or optionally remove it
      // This handles the case where undo is pressed multiple times
      setPaths(prevPaths => {
        if (prevPaths.length > originalPaths.length) {
          const newPaths = prevPaths.slice(0, -1);
          redrawCanvas(newPaths);
          return newPaths;
        }
        return prevPaths;
      });
    }
  };

  const downloadSVG = () => {
    const canvas = canvasRef.current;
    const width = canvas.width;
    const height = canvas.height;

    // Create an SVG string
    let svgContent = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;

    paths.forEach(path => {
      if (path.isCircle) {
        // Add circle to SVG
        svgContent += `<circle cx="${path.center.x}" cy="${path.center.y}" r="${path.radius}" stroke="black" fill="none" stroke-width="5" />`;
      } else if (path.isEllipse) {
        // Add ellipse to SVG
        svgContent += `<ellipse cx="${path.center.x}" cy="${path.center.y}" rx="${path.majorAxis}" ry="${path.minorAxis}" transform="rotate(${path.angle * (180/Math.PI)} ${path.center.x} ${path.center.y})" stroke="black" fill="none" stroke-width="5" />`;
      } else {
        // Add path to SVG
        svgContent += `<path d="M ${path[0].x} ${path[0].y} ${path
          .map((point) => `L ${point.x} ${point.y}`)
          .join(" ")}" stroke="black" fill="none" stroke-width="5" stroke-linecap="round" />`;
      }
    });

    svgContent += `</svg>`;

    // Create a Blob and trigger download
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
        <button onClick={() => setTool("pencil")} className="p-2 bg-blue-500 text-white rounded-lg">✏️ Pencil</button>
        <button onClick={() => setTool("eraser")} className="p-2 bg-gray-500 text-white rounded-lg">🧽 Eraser</button>
        <button onClick={undoLastProcessing} className="p-2 bg-red-500 text-white rounded-lg">Undo Processing</button>
        <button onClick={downloadSVG} className="p-2 bg-green-500 text-white rounded-lg">Download SVG</button>
      </div>
      <div className="mt-4">
        <label htmlFor="epsilon-slider" className="block text-sm font-medium text-gray-700">Epsilon Value: {epsilon}</label>
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