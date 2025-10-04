// src/components/PropertyChart.js
import React from 'react';
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend } from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

const PropertyChart = ({ data }) => {
  const chartData = {
    labels: data.map(d => d.year),
    datasets: [
      {
        label: 'Property Value Over Time',
        data: data.map(d => d.value),
        borderColor: 'rgb(75, 192, 192)',
        tension: 0.1
      },
      // Additional datasets for other metrics can be added here
    ]
  };

  return <Line data={chartData} />;
};

export default PropertyChart;
