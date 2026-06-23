import { useState, useEffect } from 'react';
import * as mobilenet from '@tensorflow-models/mobilenet';
import '@tensorflow/tfjs';

export function useAIClassifier() {
  const [model, setModel] = useState(null);
  const [isModelLoading, setIsModelLoading] = useState(true);

  // Load the model on mount
  useEffect(() => {
    let isMounted = true;
    const loadModel = async () => {
      try {
        console.log('[AI Classifier] Loading MobileNet model...');
        const loadedModel = await mobilenet.load({ version: 2, alpha: 1.0 });
        if (isMounted) {
          setModel(loadedModel);
          setIsModelLoading(false);
          console.log('[AI Classifier] Model loaded successfully');
        }
      } catch (err) {
        console.error('[AI Classifier] Failed to load model:', err);
        if (isMounted) setIsModelLoading(false);
      }
    };
    loadModel();
    return () => { isMounted = false; };
  }, []);

  /**
   * Classify an image element (HTMLImageElement)
   * Maps top prediction to Sentra damage levels
   */
  const classifyImage = async (imageElement) => {
    if (!model || !imageElement) return null;

    try {
      // Run inference
      const predictions = await Promise.race([
        model.classify(imageElement, 3),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000))
      ]);

      console.log('[AI Classifier] Predictions:', predictions);

      if (!predictions || predictions.length === 0) return null;

      const topPrediction = predictions[0];
      const { className, probability } = topPrediction;
      const lowerClass = className.toLowerCase();

      // Basic mapping logic
      let suggestedLevel = 'Minimal/No damage';
      if (
        lowerClass.includes('rubble') || 
        lowerClass.includes('ruin') || 
        lowerClass.includes('debris') || 
        lowerClass.includes('wreck') ||
        lowerClass.includes('ash')
      ) {
        suggestedLevel = 'Completely damaged';
      } else if (
        lowerClass.includes('building') || 
        lowerClass.includes('house') || 
        lowerClass.includes('roof') ||
        lowerClass.includes('street') ||
        lowerClass.includes('crack')
      ) {
        suggestedLevel = 'Partially damaged';
      }

      return {
        level: suggestedLevel,
        confidence: Math.round(probability * 100),
        rawClass: className
      };
    } catch (err) {
      console.warn('[AI Classifier] Inference failed or timed out:', err);
      return null;
    }
  };

  return { isModelLoading, classifyImage, isReady: !!model };
}
