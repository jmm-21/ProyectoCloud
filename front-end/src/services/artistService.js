import axios from 'axios';

export const fetchArtists = async () => {
    try {
        const response = await axios.get(`${import.meta.env.VITE_API_URL}/api/artists`);
        return response.data.results || response.data;
    } catch (error) {
        throw error;
    }
};

export const createArtist = async (artistData) => {
    try {
        const response = await axios.post(`${import.meta.env.VITE_API_URL}/api/artists`, artistData);
        return response.data;
    } catch (error) {
        throw error;
    }
};

export const fetchArtistById = async (id) => {
    try {
        const response = await axios.get(`${import.meta.env.VITE_API_URL}/api/artists/${id}`);
        return response.data;
    } catch (error) {
        throw error;
    }
};