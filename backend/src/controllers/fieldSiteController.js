import { FieldSite } from '../models/fieldSiteModel.js';
import { sendServerError } from '../middleware/requestSecurity.js';
import { readFieldSite } from '../../../shared/fieldSites.js';
import { fieldSiteProblem } from '../../../shared/fieldAssignmentArea.js';
import { forgetFieldSites } from '../services/assignedLocationService.js';

// Everyone signed in sees the field sites: the Attendance page names the one of the barangay an
// employee chooses, and HR's pages show them.
export const getFieldSites = async (req, res) => {
  try {
    res.status(200).json({ success: true, sites: await FieldSite.findAll() });
  } catch (error) {
    sendServerError(res, error);
  }
};

// HR sets a barangay's field site ({ municipality, barangay, name, latitude, longitude,
// radiusMeters }) and gets every site back.
export const saveFieldSite = async (req, res) => {
  try {
    const { value, error } = readFieldSite(req.body);
    if (error) return res.status(400).json({ success: false, error });
    const problem = fieldSiteProblem(value);
    if (problem) return res.status(400).json({ success: false, error: problem });
    const site = await FieldSite.save(value, req.user?.name || req.user?.email || 'HR/Admin');
    forgetFieldSites();
    res.status(200).json({ success: true, site, sites: await FieldSite.findAll() });
  } catch (error) {
    sendServerError(res, error);
  }
};

// HR removes a barangay's field site (?municipality=&barangay=), so field work there counts in
// the whole barangay again.
export const deleteFieldSite = async (req, res) => {
  try {
    const municipality = typeof req.query.municipality === 'string' ? req.query.municipality.trim() : '';
    const barangay = typeof req.query.barangay === 'string' ? req.query.barangay.trim() : '';
    if (!municipality || !barangay) return res.status(400).json({ success: false, error: 'Give the municipality and barangay of the field site.' });
    if (!(await FieldSite.remove(municipality, barangay))) {
      return res.status(404).json({ success: false, error: `Brgy. ${barangay}, ${municipality} has no field site.` });
    }
    forgetFieldSites();
    res.status(200).json({ success: true, sites: await FieldSite.findAll() });
  } catch (error) {
    sendServerError(res, error);
  }
};
